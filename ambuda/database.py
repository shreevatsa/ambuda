from sqlalchemy import (
    Column,
    Integer,
    String,
    Text as _Text,
    ForeignKey,
)
from sqlalchemy.orm import (
    declarative_base,
    relationship,
)


Base = declarative_base()


def pk():
    return Column(Integer, primary_key=True)


def foreign_key(field):
    return Column(Integer, ForeignKey(field), nullable=False, index=True)


class Text(Base):
    __tablename__ = "texts"

    id = pk()
    #: Human-readable ID, which we display in the URL.
    slug = Column(String, unique=True, nullable=False)
    title = Column(String, nullable=False)

    sections = relationship("TextSection", backref="text", cascade="delete")


class TextSection(Base):
    __tablename__ = "text_sections"

    id = pk()
    text_id = foreign_key("texts.id")
    #: Human-readable ID, which we display in the URL.
    slug = Column(String, index=True, nullable=False)
    title = Column(String, nullable=False)

    blocks = relationship(
        "TextBlock", backref="section", order_by=lambda: TextBlock.n, cascade="delete"
    )


class TextBlock(Base):
    """A verse or paragraph."""

    __tablename__ = "text_blocks"

    id = pk()
    text_id = foreign_key("texts.id")
    section_id = foreign_key("text_sections.id")
    #: Human-readable ID, which we display in the URL.
    slug = Column(String, index=True, nullable=False)
    xml = Column(_Text, nullable=False)
    #: (internal-only) Block A comes before block B iff A.n < B.n.
    n = Column(Integer, nullable=False)


class BlockParse(Base):
    """Parse data for a `TextBlock`."""

    __tablename__ = "block_parses"

    id = pk()
    text_id = foreign_key("texts.id")
    block_id = foreign_key("text_blocks.id")
    data = Column(_Text, nullable=False)


class Dictionary(Base):
    __tablename__ = "dictionaries"

    id = pk()
    #: Human-readable ID, which we display in the URL.
    slug = Column(String, unique=True, nullable=False)
    title = Column(String, nullable=False)

    entries = relationship("DictionaryEntry", backref="dictionary", cascade="delete")


class DictionaryEntry(Base):
    __tablename__ = "dictionary_entries"

    id = pk()
    dictionary_id = foreign_key("dictionaries.id")
    #: Standardized lookup key for this entry
    key = Column(String, index=True, nullable=False)
    #: XML payload
    value = Column(String, nullable=False)
