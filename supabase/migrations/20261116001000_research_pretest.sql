-- ============================================================================
-- PPGA #83: the global 50-item Research Pre-Test for the CAI Presentation
-- Program course (vocational subject 21910-2006, nine chapters).
--
-- This is a NEW instrument version (2026.11.1); the legacy #61 sample
-- (2026.09.1) is left untouched. `ppg_prettest_start` records the highest
-- version, so a new response row carries 2026.11.1. The answer key remains in
-- its own server-side column; this migration also revokes client SELECT on
-- that column so the key is never readable even when RLS grants a row.
--
-- Blueprint (5-6 items per chapter, objectives drawn from that chapter's
-- ten-item bank so a parallel Final Test can match the objective set):
--   chapter-01: 6 items
--   chapter-02: 6 items
--   chapter-03: 6 items
--   chapter-04: 5 items
--   chapter-05: 5 items
--   chapter-06: 6 items
--   chapter-07: 5 items
--   chapter-08: 6 items
--   chapter-09: 5 items
--
-- The items are interleaved (round-robin across chapters, rotated each round),
-- so no chapter forms a contiguous block. Every item carries `chapter_key`
-- and `objective_key`; each has three options A/B/C with exactly one correct
-- answer. Thai copy was generated from ASCII `\uXXXX` offset pairs; the
-- content validator checks its structure.
-- ============================================================================

insert into public.ppg_pretest_instruments (version, items, answer_key)
values (
  '2026.11.1',
  '[
  {
    "id": "item_1",
    "chapter_key": "chapter-01",
    "objective_key": "definition",
    "th": {
      "prompt": "\u0e01\u0e32\u0e23\u0e19\u0e33\u0e40\u0e2a\u0e19\u0e2d\u0e04\u0e37\u0e2d\u0e2d\u0e30\u0e44\u0e23",
      "choices": {
        "A": "\u0e01\u0e32\u0e23\u0e2a\u0e37\u0e48\u0e2d\u0e2a\u0e32\u0e23\u0e04\u0e27\u0e32\u0e21\u0e04\u0e34\u0e14\u0e2b\u0e19\u0e36\u0e48\u0e07\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e43\u0e2b\u0e49\u0e1c\u0e39\u0e49\u0e1f\u0e31\u0e07\u0e40\u0e02\u0e49\u0e32\u0e43\u0e08\u0e41\u0e25\u0e30\u0e19\u0e33\u0e44\u0e1b\u0e43\u0e0a\u0e49",
        "B": "\u0e2d\u0e48\u0e32\u0e19\u0e40\u0e2d\u0e01\u0e2a\u0e32\u0e23\u0e43\u0e2b\u0e49\u0e1c\u0e39\u0e49\u0e1f\u0e31\u0e07\u0e1f\u0e31\u0e07",
        "C": "\u0e15\u0e01\u0e41\u0e15\u0e48\u0e07\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e43\u0e2b\u0e49\u0e2a\u0e27\u0e22"
      }
    },
    "en": {
      "prompt": "What is a presentation?",
      "choices": {
        "A": "Communicating one idea so the audience understands and can act on it.",
        "B": "Reading a document aloud to the audience.",
        "C": "Decorating slides so they look beautiful."
      }
    }
  },
  {
    "id": "item_2",
    "chapter_key": "chapter-02",
    "objective_key": "sb_definition",
    "th": {
      "prompt": "\u0e2a\u0e15\u0e2d\u0e23\u0e35\u0e1a\u0e2d\u0e23\u0e4c\u0e14\u0e04\u0e37\u0e2d\u0e2d\u0e30\u0e44\u0e23",
      "choices": {
        "A": "\u0e41\u0e21\u0e48\u0e41\u0e1a\u0e1a\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e40\u0e2a\u0e23\u0e47\u0e08\u0e41\u0e25\u0e49\u0e27",
        "B": "\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e41\u0e1a\u0e1a\u0e2d\u0e31\u0e01\u0e29\u0e23\u0e17\u0e35\u0e48\u0e43\u0e0a\u0e49\u0e43\u0e19\u0e44\u0e1f\u0e25\u0e4c",
        "C": "\u0e41\u0e1c\u0e19\u0e02\u0e2d\u0e07\u0e01\u0e32\u0e23\u0e19\u0e33\u0e40\u0e2a\u0e19\u0e2d\u0e17\u0e35\u0e48\u0e41\u0e2a\u0e14\u0e07\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e17\u0e35\u0e25\u0e30\u0e2a\u0e44\u0e25\u0e14\u0e4c"
      }
    },
    "en": {
      "prompt": "What is a storyboard?",
      "choices": {
        "A": "A finished slide template.",
        "B": "A list of fonts used in the file.",
        "C": "A plan of the presentation shown slide by slide."
      }
    }
  },
  {
    "id": "item_3",
    "chapter_key": "chapter-03",
    "objective_key": "program_types",
    "th": {
      "prompt": "\u0e42\u0e1b\u0e23\u0e41\u0e01\u0e23\u0e21\u0e01\u0e32\u0e23\u0e19\u0e33\u0e40\u0e2a\u0e19\u0e2d\u0e04\u0e37\u0e2d\u0e02\u0e49\u0e2d\u0e43\u0e14",
      "choices": {
        "A": "\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e1e\u0e34\u0e21\u0e1e\u0e4c\u0e41\u0e25\u0e30\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e2a\u0e41\u0e01\u0e19",
        "B": "PowerPoint, Google Slides \u0e41\u0e25\u0e30 Keynote",
        "C": "Excel \u0e41\u0e25\u0e30\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e04\u0e34\u0e14\u0e40\u0e25\u0e02"
      }
    },
    "en": {
      "prompt": "Which is presentation software?",
      "choices": {
        "A": "A printer and a scanner.",
        "B": "PowerPoint, Google Slides, and Keynote.",
        "C": "Excel and a calculator."
      }
    }
  },
  {
    "id": "item_4",
    "chapter_key": "chapter-04",
    "objective_key": "text_boxes",
    "th": {
      "prompt": "\u0e01\u0e25\u0e48\u0e2d\u0e07\u0e02\u0e49\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e43\u0e0a\u0e49\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e2d\u0e30\u0e44\u0e23",
      "choices": {
        "A": "\u0e43\u0e2a\u0e48\u0e02\u0e49\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e17\u0e35\u0e48\u0e15\u0e33\u0e41\u0e2b\u0e19\u0e48\u0e07\u0e17\u0e35\u0e48\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e1a\u0e19\u0e2a\u0e44\u0e25\u0e14\u0e4c",
        "B": "\u0e40\u0e25\u0e48\u0e19\u0e40\u0e1e\u0e25\u0e07\u0e1e\u0e37\u0e49\u0e19\u0e2b\u0e25\u0e31\u0e07",
        "C": "\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e44\u0e1f\u0e25\u0e4c\u0e25\u0e07\u0e42\u0e1f\u0e25\u0e40\u0e14\u0e2d\u0e23\u0e4c"
      }
    },
    "en": {
      "prompt": "What is a text box used for?",
      "choices": {
        "A": "Holding text at a position you choose on the slide.",
        "B": "Playing background music.",
        "C": "Saving the file to a folder."
      }
    }
  },
  {
    "id": "item_5",
    "chapter_key": "chapter-05",
    "objective_key": "picture_sources",
    "th": {
      "prompt": "\u0e41\u0e2b\u0e25\u0e48\u0e07\u0e23\u0e39\u0e1b\u0e20\u0e32\u0e1e\u0e17\u0e35\u0e48\u0e1b\u0e25\u0e2d\u0e14\u0e20\u0e31\u0e22\u0e2a\u0e33\u0e2b\u0e23\u0e31\u0e1a\u0e07\u0e32\u0e19\u0e04\u0e37\u0e2d\u0e02\u0e49\u0e2d\u0e43\u0e14",
      "choices": {
        "A": "\u0e20\u0e32\u0e1e\u0e43\u0e14 \u0e46 \u0e08\u0e32\u0e01\u0e40\u0e27\u0e47\u0e1a\u0e44\u0e0b\u0e15\u0e4c\u0e2a\u0e38\u0e48\u0e21",
        "B": "\u0e20\u0e32\u0e1e\u0e2b\u0e19\u0e49\u0e32\u0e08\u0e2d\u0e02\u0e2d\u0e07\u0e04\u0e2d\u0e23\u0e4c\u0e2a\u0e17\u0e35\u0e48\u0e15\u0e49\u0e2d\u0e07\u0e08\u0e48\u0e32\u0e22\u0e40\u0e07\u0e34\u0e19",
        "C": "\u0e04\u0e25\u0e31\u0e07\u0e20\u0e32\u0e1e\u0e02\u0e2d\u0e07\u0e1a\u0e23\u0e34\u0e29\u0e31\u0e17\u0e17\u0e35\u0e48\u0e44\u0e14\u0e49\u0e23\u0e31\u0e1a\u0e2d\u0e19\u0e38\u0e0d\u0e32\u0e15"
      }
    },
    "en": {
      "prompt": "Which is a safe source of pictures for work?",
      "choices": {
        "A": "Any image from a random website.",
        "B": "A screenshot of a paid course.",
        "C": "A company photo library with permission."
      }
    }
  },
  {
    "id": "item_6",
    "chapter_key": "chapter-06",
    "objective_key": "chart_purpose",
    "th": {
      "prompt": "\u0e40\u0e21\u0e37\u0e48\u0e2d\u0e41\u0e1c\u0e19\u0e20\u0e39\u0e21\u0e34\u0e14\u0e35\u0e01\u0e27\u0e48\u0e32\u0e15\u0e32\u0e23\u0e32\u0e07",
      "choices": {
        "A": "\u0e40\u0e21\u0e37\u0e48\u0e2d\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e21\u0e35\u0e40\u0e1e\u0e35\u0e22\u0e07\u0e04\u0e48\u0e32\u0e2b\u0e19\u0e36\u0e48\u0e07",
        "B": "\u0e40\u0e21\u0e37\u0e48\u0e2d\u0e15\u0e49\u0e2d\u0e07\u0e41\u0e2a\u0e14\u0e07\u0e41\u0e19\u0e27\u0e42\u0e19\u0e49\u0e21\u0e2b\u0e23\u0e37\u0e2d\u0e01\u0e32\u0e23\u0e40\u0e1b\u0e23\u0e35\u0e22\u0e1a\u0e40\u0e17\u0e35\u0e22\u0e1a\u0e2d\u0e22\u0e48\u0e32\u0e07\u0e23\u0e27\u0e14\u0e40\u0e23\u0e47\u0e27",
        "C": "\u0e40\u0e21\u0e37\u0e48\u0e2d\u0e15\u0e49\u0e2d\u0e07\u0e21\u0e35\u0e15\u0e31\u0e27\u0e40\u0e25\u0e02\u0e17\u0e35\u0e48\u0e41\u0e21\u0e48\u0e19\u0e22\u0e33\u0e43\u0e19\u0e17\u0e38\u0e01\u0e0a\u0e48\u0e2d\u0e07"
      }
    },
    "en": {
      "prompt": "When is a chart better than a table?",
      "choices": {
        "A": "When the data has only one value.",
        "B": "When you need to show a trend or a comparison quickly.",
        "C": "When you need exact numbers in every cell."
      }
    }
  },
  {
    "id": "item_7",
    "chapter_key": "chapter-07",
    "objective_key": "table_use",
    "th": {
      "prompt": "\u0e40\u0e21\u0e37\u0e48\u0e2d\u0e04\u0e27\u0e23\u0e43\u0e0a\u0e49\u0e15\u0e32\u0e23\u0e32\u0e07",
      "choices": {
        "A": "\u0e40\u0e21\u0e37\u0e48\u0e2d\u0e1c\u0e39\u0e49\u0e1f\u0e31\u0e07\u0e15\u0e49\u0e2d\u0e07\u0e21\u0e35\u0e04\u0e48\u0e32\u0e17\u0e35\u0e48\u0e41\u0e21\u0e48\u0e19\u0e22\u0e33\u0e40\u0e17\u0e35\u0e22\u0e1a\u0e01\u0e31\u0e19",
        "B": "\u0e40\u0e21\u0e37\u0e48\u0e2d\u0e15\u0e49\u0e2d\u0e07\u0e01\u0e32\u0e23\u0e1a\u0e2d\u0e01\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e14\u0e49\u0e27\u0e22\u0e23\u0e39\u0e1b\u0e20\u0e32\u0e1e",
        "C": "\u0e40\u0e21\u0e37\u0e48\u0e2d\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e44\u0e21\u0e48\u0e21\u0e35\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25"
      }
    },
    "en": {
      "prompt": "When is a table the right choice?",
      "choices": {
        "A": "When the audience needs exact values side by side.",
        "B": "When you want to tell a story with photos.",
        "C": "When the slide has no data."
      }
    }
  },
  {
    "id": "item_8",
    "chapter_key": "chapter-08",
    "objective_key": "transition_purpose",
    "th": {
      "prompt": "\u0e17\u0e33\u0e44\u0e21\u0e43\u0e0a\u0e49\u0e17\u0e23\u0e32\u0e19\u0e0b\u0e34\u0e0a\u0e31\u0e19\u0e2a\u0e44\u0e25\u0e14\u0e4c",
      "choices": {
        "A": "\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e17\u0e33\u0e43\u0e2b\u0e49\u0e17\u0e38\u0e01\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e2b\u0e21\u0e38\u0e19",
        "B": "\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e0b\u0e48\u0e2d\u0e19\u0e40\u0e19\u0e37\u0e49\u0e2d\u0e2b\u0e32",
        "C": "\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e1a\u0e2d\u0e01\u0e01\u0e32\u0e23\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e23\u0e30\u0e2b\u0e27\u0e48\u0e32\u0e07\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e42\u0e14\u0e22\u0e44\u0e21\u0e48\u0e23\u0e1a\u0e01\u0e27\u0e19"
      }
    },
    "en": {
      "prompt": "Why use a slide transition?",
      "choices": {
        "A": "To make every slide spin.",
        "B": "To hide the content.",
        "C": "To signal a change between slides without distracting."
      }
    }
  },
  {
    "id": "item_9",
    "chapter_key": "chapter-09",
    "objective_key": "delivery_skills",
    "th": {
      "prompt": "\u0e2d\u0e30\u0e44\u0e23\u0e0a\u0e48\u0e27\u0e22\u0e43\u0e2b\u0e49\u0e1e\u0e39\u0e14\u0e0a\u0e31\u0e14\u0e40\u0e08\u0e19\u0e23\u0e30\u0e2b\u0e27\u0e48\u0e32\u0e07\u0e01\u0e32\u0e23\u0e19\u0e33\u0e40\u0e2a\u0e19\u0e2d",
      "choices": {
        "A": "\u0e2b\u0e31\u0e19\u0e2b\u0e25\u0e31\u0e07\u0e43\u0e2b\u0e49\u0e1c\u0e39\u0e49\u0e1f\u0e31\u0e07",
        "B": "\u0e1e\u0e39\u0e14\u0e0a\u0e49\u0e32 \u0e46 \u0e2b\u0e22\u0e38\u0e14\u0e41\u0e25\u0e30\u0e21\u0e2d\u0e07\u0e1c\u0e39\u0e49\u0e1f\u0e31\u0e07",
        "C": "\u0e2d\u0e48\u0e32\u0e19\u0e17\u0e38\u0e01\u0e04\u0e33\u0e08\u0e32\u0e01\u0e2a\u0e44\u0e25\u0e14\u0e4c"
      }
    },
    "en": {
      "prompt": "What helps you speak clearly during a presentation?",
      "choices": {
        "A": "Turning your back to the audience.",
        "B": "Speaking slowly, pausing, and looking at the audience.",
        "C": "Reading every word from the slide."
      }
    }
  },
  {
    "id": "item_10",
    "chapter_key": "chapter-02",
    "objective_key": "sb_components",
    "th": {
      "prompt": "\u0e2d\u0e07\u0e04\u0e4c\u0e1b\u0e23\u0e30\u0e01\u0e2d\u0e1a\u0e02\u0e2d\u0e07\u0e2a\u0e15\u0e2d\u0e23\u0e35\u0e1a\u0e2d\u0e23\u0e4c\u0e14\u0e04\u0e37\u0e2d\u0e02\u0e49\u0e2d\u0e43\u0e14",
      "choices": {
        "A": "\u0e25\u0e33\u0e14\u0e31\u0e1a\u0e02\u0e2d\u0e07\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e41\u0e25\u0e30\u0e02\u0e49\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e1a\u0e19\u0e41\u0e15\u0e48\u0e25\u0e30\u0e2a\u0e44\u0e25\u0e14\u0e4c",
        "B": "\u0e2a\u0e35\u0e02\u0e2d\u0e07\u0e1c\u0e19\u0e31\u0e07\u0e2a\u0e33\u0e19\u0e31\u0e01\u0e07\u0e32\u0e19",
        "C": "\u0e23\u0e32\u0e04\u0e32\u0e02\u0e2d\u0e07\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e09\u0e32\u0e22"
      }
    },
    "en": {
      "prompt": "Which is a storyboard component?",
      "choices": {
        "A": "The order of slides and the message on each slide.",
        "B": "The colour of the office wall.",
        "C": "The price of the projector."
      }
    }
  },
  {
    "id": "item_11",
    "chapter_key": "chapter-03",
    "objective_key": "program_equivalents",
    "th": {
      "prompt": "\u0e1c\u0e39\u0e49\u0e40\u0e23\u0e35\u0e22\u0e19\u0e43\u0e0a\u0e49 PowerPoint \u0e42\u0e1b\u0e23\u0e41\u0e01\u0e23\u0e21\u0e43\u0e14\u0e40\u0e1b\u0e47\u0e19\u0e40\u0e17\u0e35\u0e22\u0e1a\u0e40\u0e17\u0e48\u0e32",
      "choices": {
        "A": "Photoshop",
        "B": "Notepad",
        "C": "LibreOffice Impress"
      }
    },
    "en": {
      "prompt": "A learner knows PowerPoint. Which program is an equivalent?",
      "choices": {
        "A": "Photoshop.",
        "B": "Notepad.",
        "C": "LibreOffice Impress."
      }
    }
  },
  {
    "id": "item_12",
    "chapter_key": "chapter-04",
    "objective_key": "bullets",
    "th": {
      "prompt": "\u0e40\u0e21\u0e37\u0e48\u0e2d\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e41\u0e1a\u0e1a\u0e08\u0e38\u0e14\u0e04\u0e37\u0e2d\u0e17\u0e32\u0e07\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e17\u0e35\u0e48\u0e16\u0e39\u0e01",
      "choices": {
        "A": "\u0e40\u0e21\u0e37\u0e48\u0e2d\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e44\u0e21\u0e48\u0e21\u0e35\u0e0a\u0e37\u0e48\u0e2d\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07",
        "B": "\u0e40\u0e21\u0e37\u0e48\u0e2d\u0e1b\u0e23\u0e30\u0e40\u0e14\u0e47\u0e19\u0e2a\u0e31\u0e49\u0e19\u0e2b\u0e25\u0e32\u0e22\u0e02\u0e49\u0e2d\u0e43\u0e0a\u0e49\u0e04\u0e27\u0e32\u0e21\u0e04\u0e34\u0e14\u0e2b\u0e25\u0e31\u0e01\u0e40\u0e14\u0e35\u0e22\u0e27\u0e01\u0e31\u0e19",
        "C": "\u0e40\u0e21\u0e37\u0e48\u0e2d\u0e15\u0e49\u0e2d\u0e07\u0e21\u0e35\u0e22\u0e48\u0e2d\u0e2b\u0e19\u0e49\u0e32\u0e40\u0e15\u0e47\u0e21\u0e43\u0e19\u0e17\u0e38\u0e01\u0e1a\u0e23\u0e23\u0e17\u0e31\u0e14"
      }
    },
    "en": {
      "prompt": "When is a bullet list the right choice?",
      "choices": {
        "A": "When the slide has no title.",
        "B": "When several short points share one main idea.",
        "C": "When you need a full paragraph on every line."
      }
    }
  },
  {
    "id": "item_13",
    "chapter_key": "chapter-05",
    "objective_key": "insert_path",
    "th": {
      "prompt": "\u0e41\u0e17\u0e23\u0e01\u0e23\u0e39\u0e1b\u0e20\u0e32\u0e1e\u0e43\u0e19 PowerPoint \u0e2d\u0e22\u0e48\u0e32\u0e07\u0e44\u0e23",
      "choices": {
        "A": "Insert > Pictures \u0e41\u0e25\u0e49\u0e27\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e44\u0e1f\u0e25\u0e4c",
        "B": "Design > Slide Size",
        "C": "View > Notes Page"
      }
    },
    "en": {
      "prompt": "How do you insert a picture in PowerPoint?",
      "choices": {
        "A": "Insert > Pictures, then choose the file.",
        "B": "Design > Slide Size.",
        "C": "View > Notes Page."
      }
    }
  },
  {
    "id": "item_14",
    "chapter_key": "chapter-06",
    "objective_key": "chart_types",
    "th": {
      "prompt": "\u0e41\u0e1c\u0e19\u0e20\u0e39\u0e21\u0e34\u0e02\u0e49\u0e2d\u0e43\u0e14\u0e41\u0e2a\u0e14\u0e07\u0e41\u0e19\u0e27\u0e42\u0e19\u0e49\u0e21\u0e15\u0e25\u0e2d\u0e14\u0e40\u0e27\u0e25\u0e32\u0e14\u0e35\u0e17\u0e35\u0e48\u0e2a\u0e38\u0e14",
      "choices": {
        "A": "\u0e41\u0e1c\u0e19\u0e20\u0e39\u0e21\u0e34\u0e27\u0e07\u0e01\u0e25\u0e21",
        "B": "\u0e15\u0e32\u0e23\u0e32\u0e07\u0e23\u0e32\u0e22\u0e0a\u0e37\u0e48\u0e2d",
        "C": "\u0e41\u0e1c\u0e19\u0e20\u0e39\u0e21\u0e34\u0e40\u0e2a\u0e49\u0e19"
      }
    },
    "en": {
      "prompt": "Which chart best shows a trend over time?",
      "choices": {
        "A": "A pie chart.",
        "B": "A table of names.",
        "C": "A line chart."
      }
    }
  },
  {
    "id": "item_15",
    "chapter_key": "chapter-07",
    "objective_key": "table_create",
    "th": {
      "prompt": "\u0e40\u0e1e\u0e34\u0e48\u0e21\u0e15\u0e32\u0e23\u0e32\u0e07\u0e43\u0e19 PowerPoint \u0e2d\u0e22\u0e48\u0e32\u0e07\u0e44\u0e23",
      "choices": {
        "A": "File > Print",
        "B": "Insert > Table \u0e41\u0e25\u0e49\u0e27\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e41\u0e16\u0e27\u0e41\u0e25\u0e30\u0e04\u0e2d\u0e25\u0e31\u0e21\u0e19\u0e4c",
        "C": "Home > New Slide"
      }
    },
    "en": {
      "prompt": "How do you add a table in PowerPoint?",
      "choices": {
        "A": "File > Print.",
        "B": "Insert > Table, then choose the rows and columns.",
        "C": "Home > New Slide."
      }
    }
  },
  {
    "id": "item_16",
    "chapter_key": "chapter-08",
    "objective_key": "transition_apply",
    "th": {
      "prompt": "\u0e43\u0e0a\u0e49\u0e17\u0e23\u0e32\u0e19\u0e0b\u0e34\u0e0a\u0e31\u0e19\u0e2b\u0e19\u0e36\u0e48\u0e07\u0e01\u0e31\u0e1a\u0e17\u0e38\u0e01\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e2d\u0e22\u0e48\u0e32\u0e07\u0e44\u0e23",
      "choices": {
        "A": "\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e17\u0e23\u0e32\u0e19\u0e0b\u0e34\u0e0a\u0e31\u0e19\u0e41\u0e25\u0e49\u0e27\u0e43\u0e0a\u0e49\u0e01\u0e31\u0e1a\u0e17\u0e31\u0e49\u0e07\u0e2b\u0e21\u0e14",
        "B": "\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e41\u0e1a\u0e1a\u0e2d\u0e31\u0e01\u0e29\u0e23\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e2b\u0e25\u0e31\u0e01",
        "C": "\u0e25\u0e1a\u0e1a\u0e32\u0e19\u0e2b\u0e19\u0e49\u0e32\u0e15\u0e48\u0e32\u0e07\u0e41\u0e2d\u0e19\u0e34\u0e40\u0e21\u0e0a\u0e31\u0e19"
      }
    },
    "en": {
      "prompt": "How do you apply one transition to all slides?",
      "choices": {
        "A": "Choose the transition, then Apply To All.",
        "B": "Change the slide master font.",
        "C": "Delete the animation pane."
      }
    }
  },
  {
    "id": "item_17",
    "chapter_key": "chapter-09",
    "objective_key": "delivery_setup",
    "th": {
      "prompt": "\u0e01\u0e48\u0e2d\u0e19\u0e1c\u0e39\u0e49\u0e1f\u0e31\u0e07\u0e21\u0e32\u0e16\u0e36\u0e07\u0e04\u0e27\u0e23\u0e15\u0e23\u0e27\u0e08\u0e2a\u0e2d\u0e1a\u0e2d\u0e30\u0e44\u0e23",
      "choices": {
        "A": "\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e0a\u0e07\u0e01\u0e32\u0e41\u0e1f\u0e02\u0e2d\u0e07\u0e2a\u0e33\u0e19\u0e31\u0e01\u0e07\u0e32\u0e19",
        "B": "\u0e2a\u0e35\u0e02\u0e2d\u0e07\u0e40\u0e01\u0e49\u0e32\u0e2d\u0e35\u0e49",
        "C": "\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e09\u0e32\u0e22 \u0e40\u0e2a\u0e35\u0e22\u0e07 \u0e41\u0e25\u0e30\u0e23\u0e35\u0e42\u0e21\u0e17"
      }
    },
    "en": {
      "prompt": "What should you check before the audience arrives?",
      "choices": {
        "A": "The office coffee machine.",
        "B": "The colour of the chairs.",
        "C": "The projector, the sound, and the clicker."
      }
    }
  },
  {
    "id": "item_18",
    "chapter_key": "chapter-01",
    "objective_key": "purposes",
    "th": {
      "prompt": "\u0e08\u0e38\u0e14\u0e1b\u0e23\u0e30\u0e2a\u0e07\u0e04\u0e4c\u0e02\u0e2d\u0e07\u0e01\u0e32\u0e23\u0e19\u0e33\u0e40\u0e2a\u0e19\u0e2d\u0e04\u0e37\u0e2d\u0e02\u0e49\u0e2d\u0e43\u0e14",
      "choices": {
        "A": "\u0e40\u0e25\u0e37\u0e48\u0e2d\u0e19\u0e01\u0e32\u0e23\u0e15\u0e31\u0e14\u0e2a\u0e34\u0e19\u0e43\u0e08\u0e2d\u0e2d\u0e01\u0e44\u0e1b",
        "B": "\u0e43\u0e2b\u0e49\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25 \u0e42\u0e19\u0e49\u0e21\u0e19\u0e49\u0e32\u0e27 \u0e1d\u0e36\u0e01\u0e2d\u0e1a\u0e23\u0e21 \u0e2b\u0e23\u0e37\u0e2d\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19",
        "C": "\u0e23\u0e31\u0e01\u0e29\u0e32\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e44\u0e27\u0e49\u0e04\u0e19\u0e40\u0e14\u0e35\u0e22\u0e27"
      }
    },
    "en": {
      "prompt": "Which is a purpose of a presentation?",
      "choices": {
        "A": "To postpone a decision.",
        "B": "To inform, persuade, train, or report.",
        "C": "To keep the information to yourself."
      }
    }
  },
  {
    "id": "item_19",
    "chapter_key": "chapter-03",
    "objective_key": "create_presentation",
    "th": {
      "prompt": "\u0e40\u0e21\u0e37\u0e48\u0e2d\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e01\u0e32\u0e23\u0e19\u0e33\u0e40\u0e2a\u0e19\u0e2d\u0e43\u0e2b\u0e21\u0e48 \u0e02\u0e31\u0e49\u0e19\u0e15\u0e2d\u0e19\u0e41\u0e23\u0e01\u0e21\u0e31\u0e01\u0e04\u0e37\u0e2d\u0e2d\u0e30\u0e44\u0e23",
      "choices": {
        "A": "\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e44\u0e1f\u0e25\u0e4c\u0e27\u0e48\u0e32\u0e07\u0e2b\u0e23\u0e37\u0e2d\u0e41\u0e21\u0e48\u0e41\u0e1a\u0e1a\u0e17\u0e35\u0e48\u0e40\u0e2b\u0e21\u0e32\u0e30\u0e01\u0e31\u0e1a\u0e07\u0e32\u0e19",
        "B": "\u0e40\u0e23\u0e34\u0e48\u0e21\u0e40\u0e1e\u0e34\u0e48\u0e21\u0e41\u0e2d\u0e19\u0e34\u0e40\u0e21\u0e0a\u0e31\u0e19\u0e43\u0e2b\u0e49\u0e17\u0e38\u0e01\u0e27\u0e31\u0e15\u0e16\u0e38",
        "C": "\u0e1e\u0e34\u0e21\u0e1e\u0e4c\u0e44\u0e1f\u0e25\u0e4c\u0e01\u0e48\u0e2d\u0e19\u0e40\u0e02\u0e35\u0e22\u0e19"
      }
    },
    "en": {
      "prompt": "What is the usual first step when creating a new presentation?",
      "choices": {
        "A": "Choose a blank file or a template that fits the work.",
        "B": "Start adding animation to every object.",
        "C": "Print the file before writing."
      }
    }
  },
  {
    "id": "item_20",
    "chapter_key": "chapter-04",
    "objective_key": "alignment",
    "th": {
      "prompt": "\u0e01\u0e32\u0e23\u0e08\u0e31\u0e14\u0e15\u0e33\u0e41\u0e2b\u0e19\u0e48\u0e07\u0e0b\u0e49\u0e32\u0e22\u0e0a\u0e48\u0e27\u0e22\u0e1c\u0e39\u0e49\u0e1f\u0e31\u0e07\u0e17\u0e33\u0e2d\u0e30\u0e44\u0e23",
      "choices": {
        "A": "\u0e2d\u0e48\u0e32\u0e19\u0e02\u0e49\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e01\u0e25\u0e31\u0e1a\u0e14\u0e49\u0e32\u0e19",
        "B": "\u0e40\u0e2b\u0e47\u0e19\u0e41\u0e2d\u0e19\u0e34\u0e40\u0e21\u0e0a\u0e31\u0e19\u0e14\u0e35\u0e02\u0e36\u0e49\u0e19",
        "C": "\u0e2b\u0e32\u0e08\u0e38\u0e14\u0e40\u0e23\u0e34\u0e48\u0e21\u0e15\u0e49\u0e19\u0e02\u0e2d\u0e07\u0e41\u0e15\u0e48\u0e25\u0e30\u0e1a\u0e23\u0e23\u0e17\u0e31\u0e14\u0e44\u0e14\u0e49\u0e40\u0e23\u0e47\u0e27"
      }
    },
    "en": {
      "prompt": "What does left alignment help the audience do?",
      "choices": {
        "A": "Read mirrored text.",
        "B": "See more animation.",
        "C": "Find the start of each line quickly."
      }
    }
  },
  {
    "id": "item_21",
    "chapter_key": "chapter-05",
    "objective_key": "picture_layout",
    "th": {
      "prompt": "\u0e2d\u0e30\u0e44\u0e23\u0e0a\u0e48\u0e27\u0e22\u0e43\u0e2b\u0e49\u0e23\u0e39\u0e1b\u0e20\u0e32\u0e1e\u0e41\u0e25\u0e30\u0e02\u0e49\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e27\u0e32\u0e07\u0e23\u0e48\u0e27\u0e21\u0e01\u0e31\u0e19\u0e14\u0e35",
      "choices": {
        "A": "\u0e27\u0e32\u0e07\u0e19\u0e2d\u0e01\u0e2a\u0e44\u0e25\u0e14\u0e4c",
        "B": "\u0e1e\u0e37\u0e49\u0e19\u0e17\u0e35\u0e48\u0e40\u0e1e\u0e35\u0e22\u0e07\u0e1e\u0e2d\u0e41\u0e25\u0e30\u0e01\u0e32\u0e23\u0e08\u0e31\u0e14\u0e15\u0e33\u0e41\u0e2b\u0e19\u0e48\u0e07\u0e01\u0e31\u0e1a\u0e1a\u0e25\u0e47\u0e2d\u0e01\u0e02\u0e49\u0e2d\u0e04\u0e27\u0e32\u0e21",
        "C": "\u0e1a\u0e31\u0e07\u0e02\u0e49\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e17\u0e31\u0e49\u0e07\u0e2b\u0e21\u0e14"
      }
    },
    "en": {
      "prompt": "What helps a picture sit well with text?",
      "choices": {
        "A": "Placing it off the slide.",
        "B": "Enough space and alignment with the text block.",
        "C": "Covering the whole text."
      }
    }
  },
  {
    "id": "item_22",
    "chapter_key": "chapter-06",
    "objective_key": "create_chart",
    "th": {
      "prompt": "\u0e02\u0e31\u0e49\u0e19\u0e15\u0e2d\u0e19\u0e41\u0e23\u0e01\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e41\u0e1c\u0e19\u0e20\u0e39\u0e21\u0e34\u0e04\u0e37\u0e2d\u0e2d\u0e30\u0e44\u0e23",
      "choices": {
        "A": "\u0e40\u0e15\u0e23\u0e35\u0e22\u0e21\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e43\u0e19\u0e15\u0e32\u0e23\u0e32\u0e07",
        "B": "\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e04\u0e27\u0e32\u0e21\u0e40\u0e23\u0e47\u0e27\u0e41\u0e2d\u0e19\u0e34\u0e40\u0e21\u0e0a\u0e31\u0e19",
        "C": "\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e1e\u0e37\u0e49\u0e19\u0e2b\u0e25\u0e31\u0e07\u0e2a\u0e44\u0e25\u0e14\u0e4c"
      }
    },
    "en": {
      "prompt": "What is the first step to create a chart?",
      "choices": {
        "A": "Prepare the data in a table.",
        "B": "Choose the animation speed.",
        "C": "Change the slide background."
      }
    }
  },
  {
    "id": "item_23",
    "chapter_key": "chapter-07",
    "objective_key": "table_data",
    "th": {
      "prompt": "\u0e41\u0e16\u0e27\u0e2b\u0e31\u0e27\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e04\u0e27\u0e23\u0e1b\u0e23\u0e30\u0e01\u0e2d\u0e1a\u0e14\u0e49\u0e27\u0e22\u0e2d\u0e30\u0e44\u0e23",
      "choices": {
        "A": "\u0e22\u0e48\u0e2d\u0e2b\u0e19\u0e49\u0e32\u0e04\u0e33\u0e2d\u0e18\u0e34\u0e1a\u0e32\u0e22\u0e22\u0e32\u0e27",
        "B": "\u0e40\u0e1e\u0e35\u0e22\u0e07\u0e42\u0e25\u0e42\u0e01\u0e49\u0e1a\u0e23\u0e34\u0e29\u0e31\u0e17",
        "C": "\u0e1b\u0e49\u0e32\u0e22\u0e2a\u0e31\u0e49\u0e19\u0e17\u0e35\u0e48\u0e1a\u0e2d\u0e01\u0e0a\u0e37\u0e48\u0e2d\u0e41\u0e15\u0e48\u0e25\u0e30\u0e04\u0e2d\u0e25\u0e31\u0e21\u0e19\u0e4c"
      }
    },
    "en": {
      "prompt": "What should the header row contain?",
      "choices": {
        "A": "Long paragraphs of explanation.",
        "B": "Only the company logo.",
        "C": "Short labels that name each column."
      }
    }
  },
  {
    "id": "item_24",
    "chapter_key": "chapter-08",
    "objective_key": "transition_timing",
    "th": {
      "prompt": "\u0e23\u0e30\u0e22\u0e30\u0e40\u0e27\u0e25\u0e32\u0e17\u0e23\u0e32\u0e19\u0e0b\u0e34\u0e0a\u0e31\u0e19\u0e17\u0e35\u0e48\u0e22\u0e32\u0e27\u0e02\u0e36\u0e49\u0e19\u0e17\u0e33\u0e2d\u0e30\u0e44\u0e23",
      "choices": {
        "A": "\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e25\u0e33\u0e14\u0e31\u0e1a\u0e2a\u0e44\u0e25\u0e14\u0e4c",
        "B": "\u0e17\u0e33\u0e43\u0e2b\u0e49\u0e01\u0e32\u0e23\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e0a\u0e49\u0e32\u0e25\u0e07\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e43\u0e2b\u0e49\u0e1c\u0e39\u0e49\u0e1f\u0e31\u0e07\u0e2a\u0e32\u0e21\u0e32\u0e23\u0e16\u0e15\u0e34\u0e14\u0e15\u0e32\u0e21",
        "C": "\u0e17\u0e33\u0e43\u0e2b\u0e49\u0e40\u0e19\u0e37\u0e49\u0e2d\u0e2b\u0e32\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e43\u0e2b\u0e0d\u0e48\u0e02\u0e36\u0e49\u0e19"
      }
    },
    "en": {
      "prompt": "What does a longer transition duration do?",
      "choices": {
        "A": "It changes the slide order.",
        "B": "It slows the change so the audience can follow.",
        "C": "It makes the slide content larger."
      }
    }
  },
  {
    "id": "item_25",
    "chapter_key": "chapter-09",
    "objective_key": "rehearsal",
    "th": {
      "prompt": "\u0e17\u0e33\u0e44\u0e21\u0e0b\u0e49\u0e2d\u0e21\u0e2d\u0e2d\u0e01\u0e40\u0e2a\u0e35\u0e22\u0e07\u0e01\u0e48\u0e2d\u0e19\u0e01\u0e32\u0e23\u0e19\u0e33\u0e40\u0e2a\u0e19\u0e2d\u0e08\u0e23\u0e34\u0e07",
      "choices": {
        "A": "\u0e41\u0e2a\u0e14\u0e07\u0e2a\u0e48\u0e27\u0e19\u0e02\u0e49\u0e2d\u0e43\u0e14\u0e44\u0e21\u0e48\u0e0a\u0e31\u0e14\u0e2b\u0e23\u0e37\u0e2d\u0e22\u0e32\u0e27\u0e40\u0e01\u0e34\u0e19\u0e44\u0e1b",
        "B": "\u0e41\u0e17\u0e19\u0e17\u0e35\u0e48\u0e04\u0e27\u0e32\u0e21\u0e08\u0e33\u0e40\u0e1b\u0e47\u0e19\u0e02\u0e2d\u0e07\u0e2a\u0e44\u0e25\u0e14\u0e4c",
        "C": "\u0e17\u0e33\u0e43\u0e2b\u0e49\u0e44\u0e1f\u0e25\u0e4c\u0e40\u0e1b\u0e34\u0e14\u0e40\u0e23\u0e47\u0e27\u0e02\u0e36\u0e49\u0e19"
      }
    },
    "en": {
      "prompt": "Why rehearse out loud before the real presentation?",
      "choices": {
        "A": "It shows which parts are unclear or too long.",
        "B": "It replaces the need for slides.",
        "C": "It makes the file open faster."
      }
    }
  },
  {
    "id": "item_26",
    "chapter_key": "chapter-01",
    "objective_key": "audience",
    "th": {
      "prompt": "\u0e01\u0e48\u0e2d\u0e19\u0e2d\u0e2d\u0e01\u0e41\u0e1a\u0e1a\u0e2a\u0e44\u0e25\u0e14\u0e4c \u0e04\u0e27\u0e23\u0e23\u0e39\u0e49\u0e2a\u0e34\u0e48\u0e07\u0e43\u0e14\u0e41\u0e23\u0e01",
      "choices": {
        "A": "\u0e41\u0e2d\u0e19\u0e34\u0e40\u0e21\u0e0a\u0e31\u0e19\u0e43\u0e14\u0e2a\u0e27\u0e22\u0e17\u0e35\u0e48\u0e2a\u0e38\u0e14",
        "B": "\u0e15\u0e34\u0e14\u0e15\u0e31\u0e49\u0e07\u0e41\u0e1a\u0e1a\u0e2d\u0e31\u0e01\u0e29\u0e23\u0e44\u0e14\u0e49\u0e01\u0e35\u0e48\u0e41\u0e1a\u0e1a",
        "C": "\u0e1c\u0e39\u0e49\u0e1f\u0e31\u0e07\u0e04\u0e37\u0e2d\u0e43\u0e04\u0e23\u0e41\u0e25\u0e30\u0e15\u0e49\u0e2d\u0e07\u0e01\u0e32\u0e23\u0e2d\u0e30\u0e44\u0e23"
      }
    },
    "en": {
      "prompt": "Before designing slides, what should you know first?",
      "choices": {
        "A": "Which animation looks the most beautiful.",
        "B": "How many fonts you can install.",
        "C": "Who the audience is and what they need."
      }
    }
  },
  {
    "id": "item_27",
    "chapter_key": "chapter-02",
    "objective_key": "sb_benefits",
    "th": {
      "prompt": "\u0e17\u0e33\u0e44\u0e21\u0e15\u0e49\u0e2d\u0e07\u0e27\u0e32\u0e07\u0e41\u0e1c\u0e19\u0e14\u0e49\u0e27\u0e22\u0e2a\u0e15\u0e2d\u0e23\u0e35\u0e1a\u0e2d\u0e23\u0e4c\u0e14\u0e01\u0e48\u0e2d\u0e19\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e2a\u0e44\u0e25\u0e14\u0e4c",
      "choices": {
        "A": "\u0e15\u0e31\u0e14\u0e04\u0e27\u0e32\u0e21\u0e08\u0e33\u0e40\u0e1b\u0e47\u0e19\u0e43\u0e19\u0e01\u0e32\u0e23\u0e0b\u0e49\u0e2d\u0e21",
        "B": "\u0e41\u0e2a\u0e14\u0e07\u0e0a\u0e48\u0e2d\u0e07\u0e27\u0e48\u0e32\u0e07\u0e02\u0e2d\u0e07\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e01\u0e48\u0e2d\u0e19\u0e43\u0e0a\u0e49\u0e40\u0e27\u0e25\u0e32\u0e01\u0e31\u0e1a\u0e01\u0e32\u0e23\u0e2d\u0e2d\u0e01\u0e41\u0e1a\u0e1a",
        "C": "\u0e17\u0e33\u0e43\u0e2b\u0e49\u0e44\u0e1f\u0e25\u0e4c\u0e43\u0e2b\u0e0d\u0e48\u0e02\u0e36\u0e49\u0e19"
      }
    },
    "en": {
      "prompt": "Why plan with a storyboard before building slides?",
      "choices": {
        "A": "It removes the need to rehearse.",
        "B": "It shows gaps in the story before you spend time on design.",
        "C": "It makes the file larger."
      }
    }
  },
  {
    "id": "item_28",
    "chapter_key": "chapter-04",
    "objective_key": "emphasis_limit",
    "th": {
      "prompt": "\u0e02\u0e49\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e1a\u0e19\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e04\u0e27\u0e23\u0e40\u0e19\u0e49\u0e19\u0e40\u0e17\u0e48\u0e32\u0e44\u0e23",
      "choices": {
        "A": "\u0e40\u0e1e\u0e35\u0e22\u0e07\u0e04\u0e33\u0e2a\u0e33\u0e04\u0e31\u0e0d\u0e2b\u0e23\u0e37\u0e2d\u0e15\u0e31\u0e27\u0e40\u0e25\u0e02 \u0e44\u0e21\u0e48\u0e43\u0e0a\u0e48\u0e17\u0e31\u0e49\u0e07\u0e2b\u0e21\u0e14",
        "B": "\u0e17\u0e38\u0e01\u0e1b\u0e23\u0e30\u0e42\u0e22\u0e04\u0e40\u0e1b\u0e47\u0e19\u0e15\u0e31\u0e27\u0e2b\u0e19\u0e32",
        "C": "\u0e44\u0e21\u0e48\u0e21\u0e35\u0e02\u0e49\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e40\u0e25\u0e22"
      }
    },
    "en": {
      "prompt": "How much text on a slide should be emphasised?",
      "choices": {
        "A": "Only the key words or numbers, not everything.",
        "B": "Every sentence in bold.",
        "C": "No text at all."
      }
    }
  },
  {
    "id": "item_29",
    "chapter_key": "chapter-05",
    "objective_key": "crop",
    "th": {
      "prompt": "\u0e04\u0e23\u0e2d\u0e1b\u0e23\u0e39\u0e1b\u0e20\u0e32\u0e1e\u0e17\u0e33\u0e2d\u0e30\u0e44\u0e23",
      "choices": {
        "A": "\u0e17\u0e33\u0e43\u0e2b\u0e49\u0e23\u0e39\u0e1b\u0e20\u0e32\u0e1e\u0e40\u0e1a\u0e25\u0e2d\u0e42\u0e14\u0e22\u0e15\u0e31\u0e49\u0e07\u0e43\u0e08",
        "B": "\u0e25\u0e1a\u0e44\u0e1f\u0e25\u0e4c\u0e15\u0e49\u0e19\u0e09\u0e1a\u0e31\u0e1a",
        "C": "\u0e15\u0e31\u0e14\u0e02\u0e2d\u0e1a\u0e17\u0e35\u0e48\u0e44\u0e21\u0e48\u0e15\u0e49\u0e2d\u0e07\u0e01\u0e32\u0e23\u0e42\u0e14\u0e22\u0e44\u0e21\u0e48\u0e22\u0e37\u0e14\u0e23\u0e39\u0e1b\u0e20\u0e32\u0e1e"
      }
    },
    "en": {
      "prompt": "What does cropping a picture do?",
      "choices": {
        "A": "Makes the picture blurry on purpose.",
        "B": "Deletes the original file.",
        "C": "Removes the unwanted edges without stretching it."
      }
    }
  },
  {
    "id": "item_30",
    "chapter_key": "chapter-06",
    "objective_key": "chart_data",
    "th": {
      "prompt": "\u0e16\u0e49\u0e32\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e43\u0e19\u0e15\u0e32\u0e23\u0e32\u0e07\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e04\u0e27\u0e23\u0e17\u0e33\u0e2d\u0e30\u0e44\u0e23",
      "choices": {
        "A": "\u0e1b\u0e25\u0e48\u0e2d\u0e22\u0e41\u0e1c\u0e19\u0e20\u0e39\u0e21\u0e34\u0e15\u0e32\u0e21\u0e40\u0e14\u0e34\u0e21",
        "B": "\u0e2d\u0e31\u0e1b\u0e40\u0e14\u0e15\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e41\u0e1c\u0e19\u0e20\u0e39\u0e21\u0e34\u0e41\u0e25\u0e30\u0e15\u0e23\u0e27\u0e08\u0e2a\u0e2d\u0e1a\u0e1c\u0e25",
        "C": "\u0e25\u0e1a\u0e41\u0e1c\u0e19\u0e20\u0e39\u0e21\u0e34\u0e41\u0e25\u0e30\u0e40\u0e23\u0e34\u0e48\u0e21\u0e43\u0e2b\u0e21\u0e48"
      }
    },
    "en": {
      "prompt": "If the data in the table changes, what should you do?",
      "choices": {
        "A": "Leave the old chart as it is.",
        "B": "Update the chart data and check the result.",
        "C": "Delete the chart and start again."
      }
    }
  },
  {
    "id": "item_31",
    "chapter_key": "chapter-07",
    "objective_key": "table_edit",
    "th": {
      "prompt": "\u0e17\u0e33\u0e43\u0e2b\u0e49\u0e41\u0e16\u0e27\u0e2b\u0e19\u0e36\u0e48\u0e07\u0e2a\u0e39\u0e07\u0e02\u0e36\u0e49\u0e19\u0e42\u0e14\u0e22\u0e44\u0e21\u0e48\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e02\u0e49\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e2d\u0e22\u0e48\u0e32\u0e07\u0e44\u0e23",
      "choices": {
        "A": "\u0e25\u0e32\u0e01\u0e02\u0e2d\u0e1a\u0e41\u0e16\u0e27\u0e2b\u0e23\u0e37\u0e2d\u0e01\u0e33\u0e2b\u0e19\u0e14\u0e04\u0e27\u0e32\u0e21\u0e2a\u0e39\u0e07\u0e41\u0e16\u0e27",
        "B": "\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e2a\u0e35\u0e41\u0e1a\u0e1a\u0e2d\u0e31\u0e01\u0e29\u0e23",
        "C": "\u0e25\u0e1a\u0e04\u0e2d\u0e25\u0e31\u0e21\u0e19\u0e4c"
      }
    },
    "en": {
      "prompt": "How do you make one row taller without changing the text?",
      "choices": {
        "A": "Drag the row border or set the row height.",
        "B": "Change the font colour.",
        "C": "Delete the column."
      }
    }
  },
  {
    "id": "item_32",
    "chapter_key": "chapter-08",
    "objective_key": "animation_purpose",
    "th": {
      "prompt": "\u0e41\u0e2d\u0e19\u0e34\u0e40\u0e21\u0e0a\u0e31\u0e19\u0e27\u0e31\u0e15\u0e16\u0e38\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e2d\u0e30\u0e44\u0e23",
      "choices": {
        "A": "\u0e17\u0e33\u0e43\u0e2b\u0e49\u0e44\u0e1f\u0e25\u0e4c\u0e40\u0e25\u0e47\u0e01\u0e25\u0e07",
        "B": "\u0e1e\u0e34\u0e21\u0e1e\u0e4c\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e40\u0e23\u0e47\u0e27\u0e02\u0e36\u0e49\u0e19",
        "C": "\u0e40\u0e1c\u0e22\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e17\u0e35\u0e25\u0e30\u0e02\u0e31\u0e49\u0e19\u0e17\u0e35\u0e48\u0e08\u0e31\u0e07\u0e2b\u0e27\u0e30\u0e40\u0e2b\u0e21\u0e32\u0e30\u0e2a\u0e21"
      }
    },
    "en": {
      "prompt": "What is object animation for?",
      "choices": {
        "A": "Making the file smaller.",
        "B": "Printing the slides faster.",
        "C": "Revealing information step by step at the right moment."
      }
    }
  },
  {
    "id": "item_33",
    "chapter_key": "chapter-09",
    "objective_key": "support_docs_types",
    "th": {
      "prompt": "\u0e40\u0e2d\u0e01\u0e2a\u0e32\u0e23\u0e2a\u0e19\u0e31\u0e1a\u0e2a\u0e19\u0e38\u0e19\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e01\u0e32\u0e23\u0e19\u0e33\u0e40\u0e2a\u0e19\u0e2d\u0e04\u0e37\u0e2d\u0e02\u0e49\u0e2d\u0e43\u0e14",
      "choices": {
        "A": "\u0e2d\u0e31\u0e25\u0e1a\u0e31\u0e49\u0e21\u0e2a\u0e48\u0e27\u0e19\u0e15\u0e31\u0e27",
        "B": "\u0e40\u0e2d\u0e01\u0e2a\u0e32\u0e23\u0e41\u0e08\u0e01\u0e2b\u0e19\u0e36\u0e48\u0e07\u0e2b\u0e19\u0e49\u0e32\u0e17\u0e35\u0e48\u0e21\u0e35\u0e1b\u0e23\u0e30\u0e40\u0e14\u0e47\u0e19\u0e2a\u0e33\u0e04\u0e31\u0e0d",
        "C": "\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e0b\u0e37\u0e49\u0e2d\u0e02\u0e2d\u0e07"
      }
    },
    "en": {
      "prompt": "Which is a supporting document for a presentation?",
      "choices": {
        "A": "A personal photo album.",
        "B": "A one-page handout with the key points.",
        "C": "A shopping list."
      }
    }
  },
  {
    "id": "item_34",
    "chapter_key": "chapter-01",
    "objective_key": "structure",
    "th": {
      "prompt": "\u0e01\u0e32\u0e23\u0e19\u0e33\u0e40\u0e2a\u0e19\u0e2d\u0e17\u0e35\u0e48\u0e0a\u0e31\u0e14\u0e40\u0e08\u0e19\u0e21\u0e31\u0e01\u0e21\u0e35\u0e2a\u0e32\u0e21\u0e2a\u0e48\u0e27\u0e19\u0e43\u0e14",
      "choices": {
        "A": "\u0e1a\u0e17\u0e19\u0e33 \u0e40\u0e19\u0e37\u0e49\u0e2d\u0e2b\u0e32\u0e2b\u0e25\u0e31\u0e01 \u0e41\u0e25\u0e30\u0e1a\u0e17\u0e2a\u0e23\u0e38\u0e1b",
        "B": "\u0e0a\u0e37\u0e48\u0e2d\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07 \u0e41\u0e2d\u0e19\u0e34\u0e40\u0e21\u0e0a\u0e31\u0e19 \u0e41\u0e25\u0e30\u0e40\u0e2a\u0e35\u0e22\u0e07",
        "C": "\u0e41\u0e1c\u0e19\u0e20\u0e39\u0e21\u0e34 \u0e15\u0e32\u0e23\u0e32\u0e07 \u0e41\u0e25\u0e30\u0e27\u0e34\u0e14\u0e35\u0e42\u0e2d"
      }
    },
    "en": {
      "prompt": "A clear presentation usually has which three parts?",
      "choices": {
        "A": "Opening, main content, and closing.",
        "B": "Title, animation, and sound.",
        "C": "Chart, table, and video."
      }
    }
  },
  {
    "id": "item_35",
    "chapter_key": "chapter-02",
    "objective_key": "sb_sequence",
    "th": {
      "prompt": "\u0e2b\u0e25\u0e31\u0e07\u0e1a\u0e17\u0e19\u0e33\u0e41\u0e25\u0e49\u0e27\u0e04\u0e37\u0e2d\u0e2a\u0e48\u0e27\u0e19\u0e43\u0e14",
      "choices": {
        "A": "\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e02\u0e2d\u0e1a\u0e04\u0e38\u0e13\u0e43\u0e19\u0e1a\u0e17\u0e2a\u0e23\u0e38\u0e1b",
        "B": "\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e1c\u0e39\u0e49\u0e1a\u0e23\u0e23\u0e22\u0e32\u0e22\u0e17\u0e35\u0e48\u0e0b\u0e48\u0e2d\u0e19\u0e44\u0e27\u0e49",
        "C": "\u0e40\u0e19\u0e37\u0e49\u0e2d\u0e2b\u0e32\u0e2b\u0e25\u0e31\u0e01\u0e17\u0e35\u0e48\u0e2a\u0e19\u0e31\u0e1a\u0e2a\u0e19\u0e38\u0e19\u0e40\u0e1b\u0e49\u0e32\u0e2b\u0e21\u0e32\u0e22"
      }
    },
    "en": {
      "prompt": "In a storyboard, what comes right after the opening?",
      "choices": {
        "A": "The closing thank-you slide.",
        "B": "The hidden speaker notes.",
        "C": "The main content that supports the goal."
      }
    }
  },
  {
    "id": "item_36",
    "chapter_key": "chapter-03",
    "objective_key": "window_parts",
    "th": {
      "prompt": "\u0e1e\u0e37\u0e49\u0e19\u0e17\u0e35\u0e48\u0e02\u0e49\u0e2d\u0e43\u0e14\u0e41\u0e2a\u0e14\u0e07\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e02\u0e2d\u0e07\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e43\u0e19\u0e2b\u0e19\u0e49\u0e32\u0e15\u0e48\u0e32\u0e07",
      "choices": {
        "A": "\u0e41\u0e16\u0e1a\u0e0a\u0e37\u0e48\u0e2d\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e17\u0e35\u0e48\u0e14\u0e49\u0e32\u0e19\u0e1a\u0e19",
        "B": "\u0e1a\u0e32\u0e19\u0e2b\u0e19\u0e49\u0e32\u0e15\u0e48\u0e32\u0e07\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e17\u0e32\u0e07\u0e0b\u0e49\u0e32\u0e22",
        "C": "\u0e41\u0e16\u0e1a\u0e2a\u0e16\u0e32\u0e19\u0e30\u0e17\u0e35\u0e48\u0e14\u0e49\u0e32\u0e19\u0e25\u0e48\u0e32\u0e07"
      }
    },
    "en": {
      "prompt": "Which area shows the list of slides in the window?",
      "choices": {
        "A": "The title bar at the top.",
        "B": "The slide pane on the left.",
        "C": "The status bar at the bottom."
      }
    }
  },
  {
    "id": "item_37",
    "chapter_key": "chapter-05",
    "objective_key": "shapes_insert",
    "th": {
      "prompt": "\u0e40\u0e21\u0e37\u0e48\u0e2d\u0e04\u0e27\u0e23\u0e43\u0e0a\u0e49\u0e23\u0e39\u0e1b\u0e17\u0e23\u0e07\u0e41\u0e17\u0e19\u0e23\u0e39\u0e1b\u0e20\u0e32\u0e1e",
      "choices": {
        "A": "\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e0a\u0e35\u0e49\u0e44\u0e1b\u0e17\u0e35\u0e48\u0e02\u0e31\u0e49\u0e19\u0e15\u0e2d\u0e19\u0e2b\u0e23\u0e37\u0e2d\u0e41\u0e2a\u0e14\u0e07\u0e04\u0e27\u0e32\u0e21\u0e2a\u0e31\u0e21\u0e1e\u0e31\u0e19\u0e18\u0e4c\u0e07\u0e48\u0e32\u0e22 \u0e46",
        "B": "\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e41\u0e17\u0e19\u0e17\u0e35\u0e48\u0e23\u0e39\u0e1b\u0e17\u0e38\u0e01\u0e43\u0e1a\u0e43\u0e19\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e17\u0e31\u0e49\u0e07\u0e2b\u0e21\u0e14",
        "C": "\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e40\u0e1e\u0e34\u0e48\u0e21\u0e02\u0e19\u0e32\u0e14\u0e44\u0e1f\u0e25\u0e4c"
      }
    },
    "en": {
      "prompt": "When should you use a shape instead of a picture?",
      "choices": {
        "A": "To point to a step or show a simple relationship.",
        "B": "To replace every photo in the deck.",
        "C": "To increase the file size."
      }
    }
  },
  {
    "id": "item_38",
    "chapter_key": "chapter-06",
    "objective_key": "chart_elements",
    "th": {
      "prompt": "\u0e2d\u0e07\u0e04\u0e4c\u0e1b\u0e23\u0e30\u0e01\u0e2d\u0e1a\u0e02\u0e49\u0e2d\u0e43\u0e14\u0e1a\u0e2d\u0e01\u0e1c\u0e39\u0e49\u0e2d\u0e48\u0e32\u0e19\u0e27\u0e48\u0e32\u0e41\u0e1c\u0e19\u0e20\u0e39\u0e21\u0e34\u0e27\u0e31\u0e14\u0e2d\u0e30\u0e44\u0e23",
      "choices": {
        "A": "\u0e02\u0e2d\u0e1a\u0e02\u0e2d\u0e07\u0e2a\u0e44\u0e25\u0e14\u0e4c",
        "B": "\u0e0a\u0e37\u0e48\u0e2d\u0e02\u0e2d\u0e07\u0e1c\u0e39\u0e49\u0e1a\u0e23\u0e23\u0e22\u0e32\u0e22",
        "C": "\u0e1b\u0e49\u0e32\u0e22\u0e41\u0e01\u0e19\u0e41\u0e25\u0e30\u0e0a\u0e37\u0e48\u0e2d\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e02\u0e2d\u0e07\u0e41\u0e1c\u0e19\u0e20\u0e39\u0e21\u0e34"
      }
    },
    "en": {
      "prompt": "Which element tells the reader what the chart measures?",
      "choices": {
        "A": "The slide border.",
        "B": "The speaker''s name.",
        "C": "The axis labels and the chart title."
      }
    }
  },
  {
    "id": "item_39",
    "chapter_key": "chapter-07",
    "objective_key": "diagram_purpose",
    "th": {
      "prompt": "\u0e41\u0e1c\u0e19\u0e20\u0e32\u0e1e\u0e43\u0e0a\u0e49\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e2d\u0e30\u0e44\u0e23",
      "choices": {
        "A": "\u0e41\u0e17\u0e19\u0e17\u0e35\u0e48\u0e0a\u0e37\u0e48\u0e2d\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e01\u0e32\u0e23\u0e19\u0e33\u0e40\u0e2a\u0e19\u0e2d",
        "B": "\u0e41\u0e2a\u0e14\u0e07\u0e04\u0e27\u0e32\u0e21\u0e2a\u0e31\u0e21\u0e1e\u0e31\u0e19\u0e18\u0e4c\u0e02\u0e2d\u0e07\u0e2a\u0e48\u0e27\u0e19\u0e15\u0e48\u0e32\u0e07 \u0e46 \u0e2b\u0e23\u0e37\u0e2d\u0e25\u0e33\u0e14\u0e31\u0e1a\u0e02\u0e2d\u0e07\u0e01\u0e23\u0e30\u0e1a\u0e27\u0e19\u0e01\u0e32\u0e23",
        "C": "\u0e40\u0e01\u0e47\u0e1a\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e01\u0e32\u0e23\u0e02\u0e32\u0e22\u0e14\u0e34\u0e1a"
      }
    },
    "en": {
      "prompt": "What is a diagram used for?",
      "choices": {
        "A": "Replacing the presentation title.",
        "B": "Showing how parts relate or how a process flows.",
        "C": "Storing the raw sales data."
      }
    }
  },
  {
    "id": "item_40",
    "chapter_key": "chapter-08",
    "objective_key": "animation_apply",
    "th": {
      "prompt": "\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e41\u0e2d\u0e19\u0e34\u0e40\u0e21\u0e0a\u0e31\u0e19\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e27\u0e31\u0e15\u0e16\u0e38\u0e17\u0e35\u0e48\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e17\u0e35\u0e48\u0e43\u0e14",
      "choices": {
        "A": "\u0e43\u0e19\u0e41\u0e17\u0e47\u0e1a\u0e41\u0e2d\u0e19\u0e34\u0e40\u0e21\u0e0a\u0e31\u0e19\u0e41\u0e25\u0e49\u0e27\u0e01\u0e33\u0e2b\u0e19\u0e14\u0e25\u0e39\u0e01\u0e40\u0e25\u0e48\u0e19",
        "B": "\u0e43\u0e19\u0e40\u0e21\u0e19\u0e39 File \u0e43\u0e15\u0e49 Save",
        "C": "\u0e43\u0e19\u0e41\u0e17\u0e47\u0e1a\u0e41\u0e17\u0e23\u0e01 \u0e43\u0e15\u0e49 Table"
      }
    },
    "en": {
      "prompt": "Where do you choose an animation for a selected object?",
      "choices": {
        "A": "In the Animations tab, then set the effect.",
        "B": "In the File menu under Save.",
        "C": "In the Insert tab under Table."
      }
    }
  },
  {
    "id": "item_41",
    "chapter_key": "chapter-09",
    "objective_key": "handout_export",
    "th": {
      "prompt": "\u0e2a\u0e48\u0e07\u0e2d\u0e2d\u0e01\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e40\u0e1b\u0e47\u0e19\u0e40\u0e2d\u0e01\u0e2a\u0e32\u0e23\u0e41\u0e08\u0e01 PDF \u0e2d\u0e22\u0e48\u0e32\u0e07\u0e44\u0e23",
      "choices": {
        "A": "Insert > Pictures",
        "B": "View > Slide Sorter",
        "C": "File > Export > Create PDF \u0e41\u0e25\u0e49\u0e27\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e23\u0e39\u0e1b\u0e41\u0e1a\u0e1a\u0e40\u0e2d\u0e01\u0e2a\u0e32\u0e23\u0e41\u0e08\u0e01"
      }
    },
    "en": {
      "prompt": "How do you export slides as a handout PDF?",
      "choices": {
        "A": "Insert > Pictures.",
        "B": "View > Slide Sorter.",
        "C": "File > Export > Create PDF, then choose the handout layout."
      }
    }
  },
  {
    "id": "item_42",
    "chapter_key": "chapter-01",
    "objective_key": "principles",
    "th": {
      "prompt": "\u0e2b\u0e25\u0e31\u0e01\u0e01\u0e32\u0e23\u0e02\u0e49\u0e2d\u0e43\u0e14\u0e0a\u0e48\u0e27\u0e22\u0e1c\u0e39\u0e49\u0e1f\u0e31\u0e07\u0e15\u0e34\u0e14\u0e15\u0e32\u0e21\u0e02\u0e49\u0e2d\u0e04\u0e27\u0e32\u0e21",
      "choices": {
        "A": "\u0e43\u0e0a\u0e49\u0e41\u0e1a\u0e1a\u0e2d\u0e31\u0e01\u0e29\u0e23\u0e2b\u0e25\u0e32\u0e22\u0e41\u0e1a\u0e1a\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e43\u0e2b\u0e49\u0e14\u0e39\u0e19\u0e48\u0e32\u0e2a\u0e19\u0e43\u0e08",
        "B": "\u0e2b\u0e19\u0e36\u0e48\u0e07\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e2b\u0e19\u0e36\u0e48\u0e07\u0e04\u0e27\u0e32\u0e21\u0e04\u0e34\u0e14",
        "C": "\u0e40\u0e15\u0e34\u0e21\u0e02\u0e49\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e43\u0e2b\u0e49\u0e21\u0e32\u0e01\u0e17\u0e35\u0e48\u0e2a\u0e38\u0e14\u0e43\u0e19\u0e17\u0e38\u0e01\u0e2a\u0e44\u0e25\u0e14\u0e4c"
      }
    },
    "en": {
      "prompt": "Which principle helps the audience follow your message?",
      "choices": {
        "A": "Use many fonts to look interesting.",
        "B": "One slide, one main idea.",
        "C": "Fill every slide with as much text as possible."
      }
    }
  },
  {
    "id": "item_43",
    "chapter_key": "chapter-02",
    "objective_key": "sb_visuals",
    "th": {
      "prompt": "\u0e23\u0e48\u0e32\u0e07\u0e2a\u0e15\u0e2d\u0e23\u0e35\u0e1a\u0e2d\u0e23\u0e4c\u0e14\u0e04\u0e27\u0e23\u0e41\u0e2a\u0e14\u0e07\u0e2d\u0e30\u0e44\u0e23",
      "choices": {
        "A": "\u0e15\u0e33\u0e41\u0e2b\u0e19\u0e48\u0e07\u0e04\u0e23\u0e48\u0e32\u0e27 \u0e46 \u0e02\u0e2d\u0e07\u0e02\u0e49\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e41\u0e25\u0e30\u0e20\u0e32\u0e1e\u0e43\u0e19\u0e41\u0e15\u0e48\u0e25\u0e30\u0e2a\u0e44\u0e25\u0e14\u0e4c",
        "B": "\u0e2a\u0e35\u0e41\u0e25\u0e30\u0e40\u0e07\u0e32\u0e2a\u0e38\u0e14\u0e17\u0e49\u0e32\u0e22\u0e17\u0e31\u0e49\u0e07\u0e2b\u0e21\u0e14",
        "C": "\u0e40\u0e1e\u0e35\u0e22\u0e07\u0e40\u0e0a\u0e34\u0e07\u0e2d\u0e23\u0e23\u0e16"
      }
    },
    "en": {
      "prompt": "What should a storyboard sketch show?",
      "choices": {
        "A": "Rough placement of text and visuals for each slide.",
        "B": "Every final colour and shadow.",
        "C": "Only the footnotes."
      }
    }
  },
  {
    "id": "item_44",
    "chapter_key": "chapter-03",
    "objective_key": "slide_master",
    "th": {
      "prompt": "\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e2b\u0e25\u0e31\u0e01\u0e04\u0e27\u0e1a\u0e04\u0e38\u0e21\u0e2d\u0e30\u0e44\u0e23",
      "choices": {
        "A": "\u0e40\u0e1e\u0e35\u0e22\u0e07\u0e02\u0e49\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e1a\u0e19\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e1b\u0e31\u0e08\u0e08\u0e38\u0e1a\u0e31\u0e19",
        "B": "\u0e23\u0e30\u0e14\u0e31\u0e1a\u0e40\u0e2a\u0e35\u0e22\u0e07\u0e44\u0e21\u0e42\u0e04\u0e23\u0e42\u0e1f\u0e19\u0e02\u0e2d\u0e07\u0e1c\u0e39\u0e49\u0e1a\u0e23\u0e23\u0e22\u0e32\u0e22",
        "C": "\u0e41\u0e1a\u0e1a\u0e2d\u0e31\u0e01\u0e29\u0e23 \u0e2a\u0e35 \u0e41\u0e25\u0e30\u0e23\u0e39\u0e1b\u0e41\u0e1a\u0e1a\u0e23\u0e48\u0e27\u0e21\u0e02\u0e2d\u0e07\u0e17\u0e38\u0e01\u0e2a\u0e44\u0e25\u0e14\u0e4c"
      }
    },
    "en": {
      "prompt": "What does the slide master control?",
      "choices": {
        "A": "Only the text on the current slide.",
        "B": "The speaker''s microphone volume.",
        "C": "The shared fonts, colours, and layout of every slide."
      }
    }
  },
  {
    "id": "item_45",
    "chapter_key": "chapter-04",
    "objective_key": "slide_order",
    "th": {
      "prompt": "\u0e17\u0e33\u0e44\u0e21\u0e23\u0e31\u0e01\u0e29\u0e32\u0e25\u0e33\u0e14\u0e31\u0e1a\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e43\u0e19 Slide Sorter",
      "choices": {
        "A": "\u0e0b\u0e48\u0e2d\u0e19\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e1c\u0e39\u0e49\u0e1a\u0e23\u0e23\u0e22\u0e32\u0e22",
        "B": "\u0e40\u0e2b\u0e47\u0e19\u0e25\u0e33\u0e14\u0e31\u0e1a\u0e02\u0e2d\u0e07\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e43\u0e19\u0e1e\u0e23\u0e34\u0e1a\u0e15\u0e32",
        "C": "\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e41\u0e1a\u0e1a\u0e2d\u0e31\u0e01\u0e29\u0e23\u0e2d\u0e31\u0e15\u0e42\u0e19\u0e21\u0e31\u0e15\u0e34"
      }
    },
    "en": {
      "prompt": "Why keep the slide order in the Slide Sorter?",
      "choices": {
        "A": "It hides the speaker notes.",
        "B": "It shows the flow of the story at a glance.",
        "C": "It changes the font automatically."
      }
    }
  },
  {
    "id": "item_46",
    "chapter_key": "chapter-06",
    "objective_key": "axis_labels",
    "th": {
      "prompt": "\u0e17\u0e33\u0e44\u0e21\u0e40\u0e1e\u0e34\u0e48\u0e21\u0e1b\u0e49\u0e32\u0e22\u0e41\u0e01\u0e19\u0e43\u0e2b\u0e49\u0e41\u0e1c\u0e19\u0e20\u0e39\u0e21\u0e34",
      "choices": {
        "A": "\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e43\u0e2b\u0e49\u0e2b\u0e19\u0e48\u0e27\u0e22\u0e41\u0e25\u0e30\u0e04\u0e48\u0e32\u0e0a\u0e31\u0e14\u0e40\u0e08\u0e19\u0e42\u0e14\u0e22\u0e44\u0e21\u0e48\u0e15\u0e49\u0e2d\u0e07\u0e40\u0e14\u0e32",
        "B": "\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e43\u0e2b\u0e49\u0e41\u0e1c\u0e19\u0e20\u0e39\u0e21\u0e34\u0e43\u0e0a\u0e49\u0e2a\u0e35\u0e21\u0e32\u0e01\u0e02\u0e36\u0e49\u0e19",
        "C": "\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e43\u0e2b\u0e49\u0e44\u0e1f\u0e25\u0e4c\u0e40\u0e1b\u0e34\u0e14\u0e40\u0e23\u0e47\u0e27\u0e02\u0e36\u0e49\u0e19"
      }
    },
    "en": {
      "prompt": "Why add axis labels to a chart?",
      "choices": {
        "A": "So the units and values are clear without guessing.",
        "B": "So the chart uses more colours.",
        "C": "So the file opens faster."
      }
    }
  },
  {
    "id": "item_47",
    "chapter_key": "chapter-08",
    "objective_key": "animation_pane",
    "th": {
      "prompt": "\u0e1a\u0e32\u0e19\u0e2b\u0e19\u0e49\u0e32\u0e15\u0e48\u0e32\u0e07\u0e41\u0e2d\u0e19\u0e34\u0e40\u0e21\u0e0a\u0e31\u0e19\u0e41\u0e2a\u0e14\u0e07\u0e2d\u0e30\u0e44\u0e23",
      "choices": {
        "A": "\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e02\u0e2d\u0e07\u0e41\u0e1a\u0e1a\u0e2d\u0e31\u0e01\u0e29\u0e23\u0e43\u0e19\u0e44\u0e1f\u0e25\u0e4c",
        "B": "\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e2a\u0e33\u0e2b\u0e23\u0e31\u0e1a\u0e1c\u0e39\u0e49\u0e1a\u0e23\u0e23\u0e22\u0e32\u0e22",
        "C": "\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e41\u0e25\u0e30\u0e25\u0e33\u0e14\u0e31\u0e1a\u0e02\u0e2d\u0e07\u0e41\u0e2d\u0e19\u0e34\u0e40\u0e21\u0e0a\u0e31\u0e19\u0e1a\u0e19\u0e2a\u0e44\u0e25\u0e14\u0e4c"
      }
    },
    "en": {
      "prompt": "What does the Animation Pane show?",
      "choices": {
        "A": "The list of fonts in the file.",
        "B": "The notes for the presenter.",
        "C": "The list and order of animations on the slide."
      }
    }
  },
  {
    "id": "item_48",
    "chapter_key": "chapter-01",
    "objective_key": "preparation",
    "th": {
      "prompt": "\u0e01\u0e48\u0e2d\u0e19\u0e19\u0e33\u0e40\u0e2a\u0e19\u0e2d\u0e43\u0e2b\u0e49\u0e25\u0e39\u0e01\u0e04\u0e49\u0e32 \u0e04\u0e27\u0e23\u0e17\u0e33\u0e2d\u0e30\u0e44\u0e23",
      "choices": {
        "A": "\u0e2d\u0e2d\u0e01\u0e08\u0e32\u0e01\u0e2b\u0e49\u0e2d\u0e07\u0e41\u0e25\u0e30\u0e43\u0e2b\u0e49\u0e25\u0e39\u0e01\u0e04\u0e49\u0e32\u0e2d\u0e48\u0e32\u0e19",
        "B": "\u0e15\u0e23\u0e27\u0e08\u0e2a\u0e2d\u0e1a\u0e40\u0e19\u0e37\u0e49\u0e2d\u0e2b\u0e32 \u0e2d\u0e38\u0e1b\u0e01\u0e23\u0e13\u0e4c \u0e41\u0e25\u0e30\u0e40\u0e27\u0e25\u0e32",
        "C": "\u0e40\u0e02\u0e35\u0e22\u0e19\u0e1a\u0e17\u0e17\u0e31\u0e49\u0e07\u0e2b\u0e21\u0e14\u0e1a\u0e19\u0e2a\u0e44\u0e25\u0e14\u0e4c"
      }
    },
    "en": {
      "prompt": "What should you do before presenting to a customer?",
      "choices": {
        "A": "Leave the room and let the customer read.",
        "B": "Check the content, the equipment, and the time.",
        "C": "Write the whole script on the slides."
      }
    }
  },
  {
    "id": "item_49",
    "chapter_key": "chapter-02",
    "objective_key": "sb_preparation",
    "th": {
      "prompt": "\u0e2a\u0e15\u0e2d\u0e23\u0e35\u0e1a\u0e2d\u0e23\u0e4c\u0e14\u0e02\u0e49\u0e2d\u0e43\u0e14\u0e14\u0e35\u0e17\u0e35\u0e48\u0e2a\u0e38\u0e14\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e02\u0e49\u0e2d\u0e40\u0e2a\u0e19\u0e2d\u0e01\u0e32\u0e23\u0e02\u0e32\u0e22",
      "choices": {
        "A": "\u0e1b\u0e31\u0e0d\u0e2b\u0e32 \u0e17\u0e32\u0e07\u0e41\u0e01\u0e49 \u0e2b\u0e25\u0e31\u0e01\u0e10\u0e32\u0e19 \u0e41\u0e25\u0e30\u0e02\u0e31\u0e49\u0e19\u0e15\u0e2d\u0e19\u0e15\u0e48\u0e2d\u0e44\u0e1b",
        "B": "\u0e2a\u0e34\u0e1a\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e40\u0e01\u0e35\u0e48\u0e22\u0e27\u0e01\u0e31\u0e1a\u0e1b\u0e23\u0e30\u0e27\u0e31\u0e15\u0e34\u0e1a\u0e23\u0e34\u0e29\u0e31\u0e17",
        "C": "\u0e2b\u0e19\u0e36\u0e48\u0e07\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e17\u0e35\u0e48\u0e21\u0e35\u0e40\u0e1e\u0e35\u0e22\u0e07\u0e42\u0e25\u0e42\u0e01\u0e49"
      }
    },
    "en": {
      "prompt": "Which storyboard works best for a sales proposal?",
      "choices": {
        "A": "Problem, solution, evidence, and the next step.",
        "B": "Ten slides of company history.",
        "C": "One slide with only a logo."
      }
    }
  },
  {
    "id": "item_50",
    "chapter_key": "chapter-03",
    "objective_key": "layout",
    "th": {
      "prompt": "\u0e17\u0e33\u0e44\u0e21\u0e43\u0e0a\u0e49\u0e23\u0e39\u0e1b\u0e41\u0e1a\u0e1a\u0e41\u0e17\u0e19\u0e01\u0e32\u0e23\u0e27\u0e32\u0e07\u0e01\u0e25\u0e48\u0e2d\u0e07\u0e02\u0e49\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e17\u0e38\u0e01\u0e08\u0e38\u0e14\u0e14\u0e49\u0e27\u0e22\u0e21\u0e37\u0e2d",
      "choices": {
        "A": "\u0e17\u0e33\u0e43\u0e2b\u0e49\u0e02\u0e49\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e41\u0e01\u0e49\u0e44\u0e02\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49",
        "B": "\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e43\u0e2b\u0e49 PDF",
        "C": "\u0e23\u0e31\u0e01\u0e29\u0e32\u0e15\u0e33\u0e41\u0e2b\u0e19\u0e48\u0e07\u0e2a\u0e21\u0e48\u0e33\u0e40\u0e2a\u0e21\u0e2d\u0e41\u0e25\u0e30\u0e1b\u0e23\u0e30\u0e2b\u0e22\u0e31\u0e14\u0e40\u0e27\u0e25\u0e32"
      }
    },
    "en": {
      "prompt": "Why use a layout instead of placing every text box by hand?",
      "choices": {
        "A": "It makes the text impossible to edit.",
        "B": "It turns the slides into a PDF.",
        "C": "It keeps positions consistent and saves time."
      }
    }
  }
]'::jsonb,
  '{
  "item_1": "A",
  "item_2": "C",
  "item_3": "B",
  "item_4": "A",
  "item_5": "C",
  "item_6": "B",
  "item_7": "A",
  "item_8": "C",
  "item_9": "B",
  "item_10": "A",
  "item_11": "C",
  "item_12": "B",
  "item_13": "A",
  "item_14": "C",
  "item_15": "B",
  "item_16": "A",
  "item_17": "C",
  "item_18": "B",
  "item_19": "A",
  "item_20": "C",
  "item_21": "B",
  "item_22": "A",
  "item_23": "C",
  "item_24": "B",
  "item_25": "A",
  "item_26": "C",
  "item_27": "B",
  "item_28": "A",
  "item_29": "C",
  "item_30": "B",
  "item_31": "A",
  "item_32": "C",
  "item_33": "B",
  "item_34": "A",
  "item_35": "C",
  "item_36": "B",
  "item_37": "A",
  "item_38": "C",
  "item_39": "B",
  "item_40": "A",
  "item_41": "C",
  "item_42": "B",
  "item_43": "A",
  "item_44": "C",
  "item_45": "B",
  "item_46": "A",
  "item_47": "C",
  "item_48": "B",
  "item_49": "A",
  "item_50": "C"
}'::jsonb
)
on conflict (version) do update
  set items = excluded.items,
      answer_key = excluded.answer_key,
      seeded_at = now();

-- The key column is server-side only. Row-level security already limits which
-- learners may read the instrument; the column grants below additionally keep
-- `answer_key` out of every client read (the submit function reads it as the
-- definer/owner, so scoring is unaffected).
revoke select on public.ppg_pretest_instruments from anon, authenticated;
grant select (version, items) on public.ppg_pretest_instruments to authenticated;
