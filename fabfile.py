import os
from pathlib import Path

from dotenv import load_dotenv
from fabric import Connection, task


load_dotenv()
APP_DIRECTORY = Path(os.environ["SERVER_APP_DIRECTORY"])
UPLOADS_DIRECTORY = Path(os.environ["SERVER_UPLOADS_DIRECTORY"])
SECRETS_DIRECTORY = Path(os.environ["SERVER_SECRETS_DIRECTORY"])

USER = os.environ["SERVER_USER"]
HOST = os.environ["SERVER_HOST"]

r = Connection(f"root@{HOST}")
c = Connection(f"{USER}@{HOST}")


@task
def init_python_3_10(_):
    py_3_10 = "https://www.python.org/ftp/python/3.10.4/Python-3.10.4.tgz"

    r.sudo("apt-get install libssl-dev openssl make gcc")
    r.sudo("apt-get install libsqlite3-dev")

    with c.cd("/opt"):
        c.sudo("cd /opt")
        c.sudo(f"wget {py_3_10}")
        c.sudo("tar xzvf Python-3.10.4.tgz")

    with c.cd("/opt/Python-3.10.4"):
        c.sudo("./configure --enable-loadable-sqlite-extensions")
        c.sudo("make")
        c.sudo("make install")

    c.sudo("ln -fs /opt/Python-3.10.4 /usr/bin/python3.10")
    c.run("python3.10 --version")


@task
def init_secrets(_):
    c.run(f"mkdir -p {SECRETS_DIRECTORY}")
    json_path = str(SECRETS_DIRECTORY / "google-cloud-credentials.json")
    c.put("production/google-cloud-credentials.json", json_path)


@task
def init_repo(_):
    url = "https://github.com/ambuda-project/ambuda.git"
    with c.cd(APP_DIRECTORY):
        c.run("git init .")
        c.run(f"git remote add origin https://github.com/ambuda-project/ambuda.git")
    deploy(c)


def deploy_to_commit(_, pointer: str):
    """Deploy the given branch pointer to production.

    :param pointer: a commit SHA, branch name, etc.
    """
    with c.cd(APP_DIRECTORY):
        # Fetch the application code.
        c.run("git fetch origin")
        c.run("git checkout main")
        c.run(f"git reset --hard {pointer}")

        # Install project requirements.
        c.run("python3.10 -m venv env")
        with c.prefix("source env/bin/activate"):
            c.run("pip install -r requirements.txt")

        # Build production CSS with Tailwind.
        c.run("npm install")
        c.run(
            (
                "npx tailwindcss -i ./ambuda/static/css/style.css "
                "-o ambuda/static/gen/style.css --minify"
            )
        )

        upgrade_db(_)

        # Copy production config settings.
        env_path = str(APP_DIRECTORY / ".env")
        c.put("production/prod-env", env_path)

    restart(_)


@task
def deploy(_):
    """Deploy the latest production commit."""
    deploy_to_commit(_, "origin/main")


@task
def rollback(_, commit):
    """Roll back to a specific prior commit.

    :param commit: the commit SHA to roll back to.
    """
    deploy_to_commit(_, commit)


def upgrade_db(_):
    """Upgrade to the latest database migration."""
    with c.prefix("source env/bin/activate"):
        c.run("alembic upgrade head")


@task
def restart(_):
    """Restart the production gunicorn instance."""
    r.run("systemctl restart ambuda")


@task
def run_module(_, module):
    assert module
    with c.cd(APP_DIRECTORY):
        with c.prefix("source env/bin/activate"):
            print(f"{module}")
            print("=" * len(module))
            c.run(f"python -m {module}")


@task
def seed_gretil(_):
    with c.cd(APP_DIRECTORY):
        c.run("./scripts/fetch-gretil-data.sh")
        run_module(_, "ambuda.seed.gretil")
