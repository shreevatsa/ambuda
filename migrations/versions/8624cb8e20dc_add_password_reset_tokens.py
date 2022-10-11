"""Add password reset tokens

Revision ID: 8624cb8e20dc
Revises: 82cf1fd072bb
Create Date: 2022-08-13 15:35:12.765980

"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "8624cb8e20dc"
down_revision = "82cf1fd072bb"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table(
        "auth_password_reset_tokens",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, default=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime()),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index(
        op.f("ix_auth_password_reset_tokens_user_id"),
        "auth_password_reset_tokens",
        ["user_id"],
        unique=False,
    )
    # ### end Alembic commands ###


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_index(
        op.f("ix_auth_password_reset_tokens_user_id"),
        table_name="auth_password_reset_tokens",
    )
    op.drop_table("auth_password_reset_tokens")
    # ### end Alembic commands ###
