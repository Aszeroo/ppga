-- ============================================================================
-- PPGA #84: the Final Mission — the comprehensive 50-item Final Test
-- (instrument version 2026.11.1), retry-aware attempts with the FIRST
-- submitted attempt preserved as the research measure, the one-time
-- 400 XP + final_test_complete reward, and the end-of-course state #86 reads.
--
-- Instruments: the legacy placeholder 2026.09.1 is left untouched. The new
-- version carries exactly 50 bilingual items, every one of the nine chapters
-- represented (5-6 items each), interleaved rather than grouped, and the SAME
-- objective_key set as the #83 research Pre-Test (2026.11.1) so the pre/post
-- comparison is blueprint-parallel. The item copy is drawn from the validated
-- chapter post-test banks (the parallel forms authored in #78-#82), rotated
-- so the answer letters differ. The answer key lives in its own server-side
-- column; this migration revokes the client SELECT grant on that column (as
-- #83 did for the Pre-Test), so a learner can never read it.
--
-- Retries: ppg_posttest_responses remains the FIRST attempt row (one per
-- learner, the research measure). Later attempts append to
-- ppg_posttest_retry_attempts (PK learner_id + attempt_no >= 2). Every
-- submitted row is immutable (BEFORE UPDATE triggers), the first row is never
-- overwritten, and ppg_final_test_state exposes first_score, best_score,
-- attempts, and the one-time reward state.
--
-- Reward: ppg_posttest_submit is the ONLY caller of
-- ppg_grant_final_test_reward (a definer-only helper from #76). It grants a
-- fixed 400 XP + final_test_complete once (ledger PK + award PK), so retries
-- are idempotent. The score never changes the reward.
-- ============================================================================

insert into public.ppg_posttest_instruments (version, items, answer_key)
values (
  '2026.11.1',
  '[
  {
    "id": "item_1",
    "chapter_key": "chapter-01",
    "objective_key": "definition",
    "th": {
      "prompt": "\u0e02\u0e49\u0e2d\u0e43\u0e14\u0e2d\u0e18\u0e34\u0e1a\u0e32\u0e22\u0e01\u0e32\u0e23\u0e19\u0e33\u0e40\u0e2a\u0e19\u0e2d\u0e44\u0e14\u0e49\u0e14\u0e35\u0e17\u0e35\u0e48\u0e2a\u0e38\u0e14",
      "choices": {
        "A": "\u0e01\u0e32\u0e23\u0e2a\u0e37\u0e2d\u0e2a\u0e32\u0e23\u0e04\u0e27\u0e32\u0e21\u0e04\u0e34\u0e14\u0e2b\u0e25\u0e31\u0e01\u0e2b\u0e19\u0e36\u0e07\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e2b\u0e43\u0e49\u0e1c\u0e39\u0e49\u0e1f\u0e31\u0e07\u0e40\u0e02\u0e49\u0e32\u0e43\u0e08",
        "B": "\u0e43\u0e0a\u0e49\u0e41\u0e2d\u0e19\u0e34\u0e40\u0e21\u0e0a\u0e31\u0e19\u0e2b\u0e43\u0e49\u0e21\u0e32\u0e01",
        "C": "\u0e41\u0e2a\u0e14\u0e07\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e17\u0e31\u0e49\u0e07\u0e2b\u0e21\u0e14\u0e17\u0e35\u0e48\u0e21\u0e35"
      }
    },
    "en": {
      "prompt": "Which best describes a presentation?",
      "choices": {
        "A": "Communicating one main idea the audience understands",
        "B": "Using as much animation as possible",
        "C": "Showing every piece of information you have"
      }
    }
  },
  {
    "id": "item_2",
    "chapter_key": "chapter-02",
    "objective_key": "sb_definition",
    "th": {
      "prompt": "\u0e02\u0e49\u0e2d\u0e43\u0e14\u0e2d\u0e18\u0e34\u0e1a\u0e32\u0e22\u0e2a\u0e15\u0e2d\u0e23\u0e35\u0e1a\u0e2d\u0e23\u0e4c\u0e14\u0e44\u0e14\u0e49\u0e16\u0e39\u0e01\u0e15\u0e49\u0e2d\u0e07",
      "choices": {
        "A": "\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e17\u0e35\u0e48\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e40\u0e2a\u0e23\u0e47\u0e08\u0e41\u0e25\u0e49\u0e27",
        "B": "\u0e41\u0e1c\u0e19\u0e25\u0e33\u0e14\u0e31\u0e1a\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e17\u0e35\u0e48\u0e23\u0e48\u0e32\u0e07\u0e2a\u0e32\u0e23\u0e30\u0e41\u0e25\u0e30\u0e20\u0e32\u0e1e\u0e01\u0e48\u0e2d\u0e19\u0e25\u0e07\u0e21\u0e37\u0e2d",
        "C": "\u0e44\u0e1f\u0e25\u0e4c\u0e27\u0e34\u0e14\u0e35\u0e42\u0e2d\u0e2a\u0e33\u0e2b\u0e23\u0e31\u0e1a\u0e19\u0e33\u0e40\u0e2a\u0e19\u0e2d"
      }
    },
    "en": {
      "prompt": "Which correctly describes a storyboard?",
      "choices": {
        "A": "A slide that is already finished",
        "B": "A slide-by-slide plan that drafts the message and visuals before you build",
        "C": "A video file for presenting"
      }
    }
  },
  {
    "id": "item_3",
    "chapter_key": "chapter-03",
    "objective_key": "program_types",
    "th": {
      "prompt": "\u0e42\u0e1b\u0e23\u0e41\u0e01\u0e23\u0e21\u0e43\u0e14\u0e43\u0e0a\u0e49\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e07\u0e32\u0e19\u0e19\u0e33\u0e40\u0e2a\u0e19\u0e2d",
      "choices": {
        "A": "\u0e42\u0e1b\u0e23\u0e41\u0e01\u0e23\u0e21\u0e15\u0e32\u0e23\u0e32\u0e07",
        "B": "\u0e42\u0e1b\u0e23\u0e41\u0e01\u0e23\u0e21\u0e15\u0e31\u0e14\u0e15\u0e48\u0e2d\u0e27\u0e34\u0e14\u0e35\u0e42\u0e2d",
        "C": "PowerPoint"
      }
    },
    "en": {
      "prompt": "Which program is used to create a presentation?",
      "choices": {
        "A": "A spreadsheet program",
        "B": "A video editor",
        "C": "PowerPoint"
      }
    }
  },
  {
    "id": "item_4",
    "chapter_key": "chapter-04",
    "objective_key": "text_boxes",
    "th": {
      "prompt": "\u0e02\u0e49\u0e2d\u0e43\u0e14\u0e40\u0e1b\u0e47\u0e19\u0e27\u0e34\u0e18\u0e35\u0e40\u0e1e\u0e34\u0e48\u0e21\u0e01\u0e25\u0e48\u0e2d\u0e07\u0e02\u0e49\u0e2d\u0e04\u0e27\u0e32\u0e21",
      "choices": {
        "A": "\u0e44\u0e1b\u0e17\u0e35\u0e48\u0e41\u0e17\u0e47\u0e1a Insert \u0e08\u0e32\u0e01\u0e19\u0e31\u0e49\u0e19\u0e40\u0e25\u0e37\u0e2d\u0e01 Text Box",
        "B": "\u0e44\u0e1b\u0e17\u0e35\u0e48\u0e41\u0e17\u0e47\u0e1a Home \u0e08\u0e32\u0e01\u0e19\u0e31\u0e49\u0e19\u0e04\u0e25\u0e34\u0e01 Bold",
        "C": "\u0e44\u0e1b\u0e17\u0e35\u0e48 Slide Show"
      }
    },
    "en": {
      "prompt": "Which is the way to add a text box?",
      "choices": {
        "A": "Go to the Insert tab and choose Text Box",
        "B": "Go to the Home tab and click Bold",
        "C": "Go to Slide Show"
      }
    }
  },
  {
    "id": "item_5",
    "chapter_key": "chapter-05",
    "objective_key": "picture_sources",
    "th": {
      "prompt": "\u0e20\u0e32\u0e1e\u0e41\u0e2b\u0e25\u0e48\u0e07\u0e43\u0e14\u0e44\u0e21\u0e48\u0e15\u0e49\u0e2d\u0e07\u0e43\u0e0a\u0e49\u0e2d\u0e34\u0e19\u0e40\u0e17\u0e2d\u0e23\u0e4c\u0e40\u0e19\u0e47\u0e15",
      "choices": {
        "A": "\u0e04\u0e49\u0e19\u0e2b\u0e32\u0e2d\u0e2d\u0e19\u0e44\u0e25\u0e19\u0e4c",
        "B": "\u0e20\u0e32\u0e1e\u0e44\u0e1f\u0e25\u0e4c\u0e43\u0e19\u0e04\u0e2d\u0e21\u0e1e\u0e34\u0e27\u0e40\u0e15\u0e2d\u0e23\u0e4c",
        "C": "\u0e20\u0e32\u0e1e\u0e2d\u0e2d\u0e19\u0e44\u0e25\u0e19\u0e4c"
      }
    },
    "en": {
      "prompt": "Which picture source does not need an internet connection?",
      "choices": {
        "A": "An online search",
        "B": "A picture file on your computer",
        "C": "Online Pictures"
      }
    }
  },
  {
    "id": "item_6",
    "chapter_key": "chapter-06",
    "objective_key": "chart_purpose",
    "th": {
      "prompt": "\u0e02\u0e49\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e43\u0e14\u0e40\u0e2b\u0e21\u0e32\u0e30\u0e2a\u0e21\u0e2a\u0e33\u0e2b\u0e23\u0e31\u0e1a\u0e41\u0e1c\u0e19\u0e20\u0e39\u0e21\u0e34\u0e40\u0e2a\u0e49\u0e19",
      "choices": {
        "A": "\u0e17\u0e35\u0e48\u0e2d\u0e22\u0e39\u0e48\u0e02\u0e2d\u0e07\u0e1a\u0e23\u0e34\u0e29\u0e31\u0e17",
        "B": "\u0e23\u0e32\u0e22\u0e0a\u0e37\u0e48\u0e2d\u0e02\u0e2d\u0e07\u0e17\u0e35\u0e21",
        "C": "\u0e02\u0e32\u0e22\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e15\u0e32\u0e21\u0e40\u0e27\u0e25\u0e32\u0e2b\u0e01\u0e40\u0e14\u0e37\u0e2d\u0e19"
      }
    },
    "en": {
      "prompt": "Which message suits a line chart?",
      "choices": {
        "A": "The company address",
        "B": "The team roster",
        "C": "How sales changed over six months"
      }
    }
  },
  {
    "id": "item_7",
    "chapter_key": "chapter-07",
    "objective_key": "table_use",
    "th": {
      "prompt": "\u0e2d\u0e30\u0e44\u0e23\u0e17\u0e33\u0e43\u0e2b\u0e49\u0e15\u0e32\u0e23\u0e32\u0e07\u0e2d\u0e48\u0e32\u0e19\u0e07\u0e48\u0e32\u0e22",
      "choices": {
        "A": "\u0e2b\u0e31\u0e27\u0e15\u0e32\u0e23\u0e32\u0e07\u0e0a\u0e31\u0e14\u0e40\u0e08\u0e19\u0e41\u0e25\u0e30\u0e40\u0e2a\u0e49\u0e19\u0e02\u0e2d\u0e1a\u0e40\u0e2b\u0e21\u0e32\u0e30\u0e2a\u0e21",
        "B": "\u0e2a\u0e35\u0e17\u0e38\u0e01\u0e40\u0e0b\u0e25\u0e25\u0e4c",
        "C": "\u0e41\u0e1a\u0e1a\u0e2d\u0e31\u0e01\u0e29\u0e23\u0e40\u0e25\u0e47\u0e01\u0e25\u0e07"
      }
    },
    "en": {
      "prompt": "What makes a table easy to read?",
      "choices": {
        "A": "A clear header row and balanced borders",
        "B": "Colour in every cell",
        "C": "A smaller font"
      }
    }
  },
  {
    "id": "item_8",
    "chapter_key": "chapter-08",
    "objective_key": "transition_purpose",
    "th": {
      "prompt": "\u0e1c\u0e25\u0e02\u0e2d\u0e07\u0e01\u0e32\u0e23\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e17\u0e35\u0e48\u0e14\u0e35\u0e04\u0e37\u0e2d\u0e2d\u0e30\u0e44\u0e23",
      "choices": {
        "A": "\u0e44\u0e1f\u0e25\u0e4c\u0e43\u0e2b\u0e0d\u0e48\u0e02\u0e36\u0e49\u0e19",
        "B": "\u0e1c\u0e39\u0e49\u0e1f\u0e31\u0e07\u0e15\u0e32\u0e21\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e15\u0e48\u0e2d\u0e40\u0e19\u0e37\u0e48\u0e2d\u0e07",
        "C": "\u0e1c\u0e39\u0e49\u0e1f\u0e31\u0e07\u0e2d\u0e48\u0e32\u0e19\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e44\u0e21\u0e48\u0e40\u0e23\u0e47\u0e27\u0e1e\u0e2d"
      }
    },
    "en": {
      "prompt": "What is the result of a good slide transition?",
      "choices": {
        "A": "The file gets bigger",
        "B": "The audience follows the story smoothly",
        "C": "The audience cannot read the slide in time"
      }
    }
  },
  {
    "id": "item_9",
    "chapter_key": "chapter-09",
    "objective_key": "delivery_skills",
    "th": {
      "prompt": "\u0e2d\u0e30\u0e44\u0e23\u0e0a\u0e48\u0e27\u0e22\u0e43\u0e2b\u0e49\u0e1c\u0e39\u0e49\u0e1f\u0e31\u0e07\u0e2d\u0e22\u0e39\u0e48\u0e01\u0e31\u0e1a\u0e04\u0e38\u0e13",
      "choices": {
        "A": "\u0e2d\u0e48\u0e32\u0e19\u0e17\u0e38\u0e01\u0e04\u0e33\u0e40\u0e23\u0e47\u0e27",
        "B": "\u0e44\u0e21\u0e48\u0e2a\u0e1a\u0e15\u0e32",
        "C": "\u0e2b\u0e22\u0e38\u0e14\u0e17\u0e35\u0e48\u0e1b\u0e23\u0e30\u0e40\u0e14\u0e47\u0e19\u0e2b\u0e25\u0e31\u0e01\u0e41\u0e25\u0e30\u0e14\u0e39\u0e08\u0e31\u0e07\u0e2b\u0e27\u0e30"
      }
    },
    "en": {
      "prompt": "What helps keep the audience with you?",
      "choices": {
        "A": "Reading every word fast",
        "B": "Avoiding eye contact",
        "C": "Pausing at the main points and watching the pace"
      }
    }
  },
  {
    "id": "item_10",
    "chapter_key": "chapter-02",
    "objective_key": "sb_components",
    "th": {
      "prompt": "\u0e01\u0e23\u0e2d\u0e1a\u0e2a\u0e15\u0e2d\u0e23\u0e35\u0e1a\u0e2d\u0e23\u0e4c\u0e14\u0e17\u0e35\u0e48\u0e14\u0e35\u0e04\u0e27\u0e23\u0e21\u0e35\u0e2d\u0e30\u0e44\u0e23",
      "choices": {
        "A": "\u0e2a\u0e32\u0e23\u0e30\u0e2b\u0e25\u0e31\u0e01 \u0e20\u0e32\u0e1e\u0e1b\u0e23\u0e30\u0e01\u0e2d\u0e1a \u0e41\u0e25\u0e30\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e1c\u0e39\u0e49\u0e1a\u0e23\u0e23\u0e22\u0e32\u0e22",
        "B": "\u0e40\u0e09\u0e1e\u0e32\u0e30\u0e0a\u0e37\u0e48\u0e2d\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07",
        "C": "\u0e40\u0e09\u0e1e\u0e32\u0e30\u0e41\u0e2d\u0e19\u0e34\u0e40\u0e21\u0e0a\u0e31\u0e19"
      }
    },
    "en": {
      "prompt": "What should a good storyboard frame contain?",
      "choices": {
        "A": "The main message, a visual, and a speaker note",
        "B": "Only a title",
        "C": "Only an animation"
      }
    }
  },
  {
    "id": "item_11",
    "chapter_key": "chapter-03",
    "objective_key": "program_equivalents",
    "th": {
      "prompt": "\u0e02\u0e49\u0e2d\u0e43\u0e14\u0e44\u0e21\u0e48\u0e43\u0e0a\u0e48\u0e42\u0e1b\u0e23\u0e41\u0e01\u0e23\u0e21\u0e19\u0e33\u0e40\u0e2a\u0e19\u0e2d",
      "choices": {
        "A": "LibreOffice Impress",
        "B": "\u0e42\u0e1b\u0e23\u0e41\u0e01\u0e23\u0e21\u0e15\u0e32\u0e23\u0e32\u0e07",
        "C": "Keynote"
      }
    },
    "en": {
      "prompt": "Which is NOT a presentation program?",
      "choices": {
        "A": "LibreOffice Impress",
        "B": "A spreadsheet program",
        "C": "Keynote"
      }
    }
  },
  {
    "id": "item_12",
    "chapter_key": "chapter-04",
    "objective_key": "bullets",
    "th": {
      "prompt": "\u0e02\u0e49\u0e2d\u0e43\u0e14\u0e04\u0e27\u0e23\u0e43\u0e0a\u0e49\u0e2a\u0e31\u0e0d\u0e25\u0e31\u0e01\u0e29\u0e13\u0e4c\u0e41\u0e2a\u0e14\u0e07\u0e2b\u0e31\u0e27\u0e02\u0e49\u0e2d",
      "choices": {
        "A": "\u0e02\u0e31\u0e49\u0e19\u0e15\u0e2d\u0e19\u0e17\u0e35\u0e48\u0e2b\u0e19\u0e36\u0e48\u0e07\u0e16\u0e36\u0e07\u0e2a\u0e32\u0e21",
        "B": "\u0e2a\u0e39\u0e15\u0e23\u0e04\u0e33\u0e19\u0e27\u0e13",
        "C": "\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e04\u0e38\u0e13\u0e2a\u0e21\u0e1a\u0e31\u0e15\u0e34\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32"
      }
    },
    "en": {
      "prompt": "Which list should use bullets?",
      "choices": {
        "A": "Steps one to three",
        "B": "A calculation formula",
        "C": "A list of product features"
      }
    }
  },
  {
    "id": "item_13",
    "chapter_key": "chapter-05",
    "objective_key": "insert_path",
    "th": {
      "prompt": "\u0e41\u0e17\u0e23\u0e01\u0e20\u0e32\u0e1e\u0e2d\u0e2d\u0e19\u0e44\u0e25\u0e19\u0e4c\u0e44\u0e1b\u0e17\u0e35\u0e48\u0e40\u0e2a\u0e49\u0e19\u0e17\u0e32\u0e07\u0e43\u0e14",
      "choices": {
        "A": "Insert \u0e08\u0e32\u0e01\u0e19\u0e31\u0e49\u0e19 Pictures \u0e08\u0e32\u0e01\u0e19\u0e31\u0e49\u0e19 Online Pictures",
        "B": "Home \u0e08\u0e32\u0e01\u0e19\u0e31\u0e49\u0e19 New Slide",
        "C": "View \u0e08\u0e32\u0e01\u0e19\u0e31\u0e49\u0e19 Slide Master"
      }
    },
    "en": {
      "prompt": "To insert an online picture, which path do you use?",
      "choices": {
        "A": "Insert, Pictures, Online Pictures",
        "B": "Home, New Slide",
        "C": "View, Slide Master"
      }
    }
  },
  {
    "id": "item_14",
    "chapter_key": "chapter-06",
    "objective_key": "chart_types",
    "th": {
      "prompt": "\u0e41\u0e1c\u0e19\u0e20\u0e39\u0e21\u0e34\u0e43\u0e14\u0e40\u0e2b\u0e21\u0e32\u0e30\u0e2a\u0e21\u0e2a\u0e33\u0e2b\u0e23\u0e31\u0e1a\u0e40\u0e1b\u0e23\u0e35\u0e22\u0e1a\u0e40\u0e17\u0e35\u0e22\u0e1a\u0e02\u0e32\u0e22\u0e02\u0e2d\u0e07\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32\u0e2b\u0e49\u0e32",
      "choices": {
        "A": "\u0e41\u0e1c\u0e19\u0e20\u0e39\u0e21\u0e34\u0e40\u0e2a\u0e49\u0e19",
        "B": "\u0e41\u0e1c\u0e19\u0e20\u0e39\u0e21\u0e34\u0e04\u0e2d\u0e25\u0e31\u0e21\u0e19\u0e4c",
        "C": "\u0e41\u0e1c\u0e19\u0e20\u0e39\u0e21\u0e34\u0e27\u0e07\u0e01\u0e25\u0e21"
      }
    },
    "en": {
      "prompt": "Which chart is best for comparing the sales of five products in one month?",
      "choices": {
        "A": "A line chart",
        "B": "A column chart",
        "C": "A pie chart"
      }
    }
  },
  {
    "id": "item_15",
    "chapter_key": "chapter-07",
    "objective_key": "table_create",
    "th": {
      "prompt": "\u0e01\u0e48\u0e2d\u0e19\u0e41\u0e17\u0e23\u0e01\u0e15\u0e32\u0e23\u0e32\u0e07\u0e15\u0e49\u0e2d\u0e07\u0e15\u0e31\u0e49\u0e07\u0e2d\u0e30\u0e44\u0e23",
      "choices": {
        "A": "\u0e2a\u0e35\u0e1e\u0e37\u0e49\u0e19\u0e2b\u0e25\u0e31\u0e07\u0e2a\u0e44\u0e25\u0e14\u0e4c",
        "B": "\u0e40\u0e2a\u0e35\u0e22\u0e07\u0e1a\u0e23\u0e23\u0e22\u0e32\u0e22",
        "C": "\u0e08\u0e33\u0e19\u0e27\u0e19\u0e41\u0e16\u0e27\u0e41\u0e25\u0e30\u0e04\u0e2d\u0e25\u0e31\u0e21\u0e19\u0e4c"
      }
    },
    "en": {
      "prompt": "Before you insert a table, what must you set?",
      "choices": {
        "A": "The slide background colour",
        "B": "The narration sound",
        "C": "The number of rows and columns"
      }
    }
  },
  {
    "id": "item_16",
    "chapter_key": "chapter-08",
    "objective_key": "transition_apply",
    "th": {
      "prompt": "\u0e2b\u0e25\u0e31\u0e07\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e41\u0e17\u0e47\u0e1a Transitions \u0e15\u0e49\u0e2d\u0e07\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e2d\u0e30\u0e44\u0e23",
      "choices": {
        "A": "\u0e01\u0e32\u0e23\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e08\u0e32\u0e01\u0e41\u0e01\u0e25\u0e40\u0e25\u0e2d\u0e23\u0e35",
        "B": "\u0e41\u0e1a\u0e1a\u0e2d\u0e31\u0e01\u0e29\u0e23",
        "C": "\u0e08\u0e33\u0e19\u0e27\u0e19\u0e04\u0e2d\u0e25\u0e31\u0e21\u0e19\u0e4c"
      }
    },
    "en": {
      "prompt": "After choosing the Transitions tab, what do you choose?",
      "choices": {
        "A": "A transition from the gallery",
        "B": "The font",
        "C": "The number of columns"
      }
    }
  },
  {
    "id": "item_17",
    "chapter_key": "chapter-09",
    "objective_key": "delivery_setup",
    "th": {
      "prompt": "\u0e01\u0e48\u0e2d\u0e19\u0e1c\u0e39\u0e49\u0e1f\u0e31\u0e07\u0e40\u0e02\u0e49\u0e32\u0e23\u0e48\u0e27\u0e21\u0e1b\u0e23\u0e30\u0e0a\u0e38\u0e21\u0e04\u0e27\u0e23\u0e40\u0e1b\u0e34\u0e14\u0e2d\u0e30\u0e44\u0e23",
      "choices": {
        "A": "\u0e23\u0e2b\u0e31\u0e2a\u0e1c\u0e48\u0e32\u0e19\u0e2b\u0e43\u0e21\u0e48",
        "B": "\u0e44\u0e1f\u0e25\u0e4c\u0e41\u0e25\u0e30\u0e21\u0e38\u0e21\u0e21\u0e2d\u0e07\u0e1c\u0e39\u0e49\u0e19\u0e33\u0e40\u0e2a\u0e19\u0e2d",
        "C": "\u0e23\u0e32\u0e04\u0e32\u0e02\u0e2d\u0e07\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32"
      }
    },
    "en": {
      "prompt": "Before the audience joins the meeting, what should you open?",
      "choices": {
        "A": "A new password",
        "B": "The file and Presenter View",
        "C": "The product price"
      }
    }
  },
  {
    "id": "item_18",
    "chapter_key": "chapter-01",
    "objective_key": "purposes",
    "th": {
      "prompt": "\u0e01\u0e32\u0e23\u0e19\u0e33\u0e40\u0e2a\u0e19\u0e2d\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e1d\u0e36\u0e01\u0e2d\u0e1a\u0e23\u0e21\u0e21\u0e35\u0e40\u0e1b\u0e49\u0e32\u0e2b\u0e21\u0e32\u0e22\u0e43\u0e14",
      "choices": {
        "A": "\u0e2b\u0e43\u0e49\u0e1c\u0e39\u0e49\u0e1f\u0e31\u0e07\u0e08\u0e33\u0e0a\u0e37\u0e48\u0e2d\u0e1a\u0e23\u0e34\u0e29\u0e31\u0e17",
        "B": "\u0e2b\u0e43\u0e49\u0e1c\u0e39\u0e49\u0e1f\u0e31\u0e07\u0e0b\u0e37\u0e49\u0e2d\u0e17\u0e31\u0e19\u0e17\u0e35\u0e40\u0e17\u0e48\u0e32\u0e19\u0e31\u0e49\u0e19",
        "C": "\u0e2b\u0e43\u0e49\u0e1c\u0e39\u0e49\u0e1f\u0e31\u0e07\u0e19\u0e33\u0e04\u0e27\u0e32\u0e21\u0e23\u0e39\u0e49\u0e44\u0e1b\u0e1b\u0e0f\u0e34\u0e1a\u0e31\u0e15\u0e34"
      }
    },
    "en": {
      "prompt": "What is the goal of a training presentation?",
      "choices": {
        "A": "For the audience to remember the company name",
        "B": "For the audience to buy immediately only",
        "C": "For the audience to apply the knowledge"
      }
    }
  },
  {
    "id": "item_19",
    "chapter_key": "chapter-03",
    "objective_key": "create_presentation",
    "th": {
      "prompt": "\u0e40\u0e1e\u0e34\u0e48\u0e21 New Slide \u0e17\u0e33\u0e17\u0e35\u0e48\u0e41\u0e17\u0e47\u0e1a\u0e43\u0e14",
      "choices": {
        "A": "Home",
        "B": "View",
        "C": "Slide Show"
      }
    },
    "en": {
      "prompt": "On which tab do you add a new slide?",
      "choices": {
        "A": "Home",
        "B": "View",
        "C": "Slide Show"
      }
    }
  },
  {
    "id": "item_20",
    "chapter_key": "chapter-04",
    "objective_key": "alignment",
    "th": {
      "prompt": "\u0e02\u0e49\u0e2d\u0e43\u0e14\u0e04\u0e37\u0e2d\u0e01\u0e32\u0e23\u0e08\u0e31\u0e14\u0e01\u0e36\u0e48\u0e07\u0e01\u0e25\u0e32\u0e07",
      "choices": {
        "A": "\u0e40\u0e1e\u0e34\u0e48\u0e21\u0e23\u0e30\u0e22\u0e30\u0e2b\u0e48\u0e32\u0e07\u0e1a\u0e23\u0e23\u0e17\u0e31\u0e14",
        "B": "\u0e27\u0e32\u0e07\u0e02\u0e49\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e43\u0e2b\u0e49\u0e2d\u0e22\u0e39\u0e48\u0e01\u0e36\u0e48\u0e07\u0e01\u0e25\u0e32\u0e07\u0e2a\u0e44\u0e25\u0e14\u0e4c",
        "C": "\u0e27\u0e32\u0e07\u0e02\u0e49\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e0a\u0e34\u0e14\u0e02\u0e2d\u0e1a\u0e0b\u0e49\u0e32\u0e22"
      }
    },
    "en": {
      "prompt": "Which is centre alignment?",
      "choices": {
        "A": "Increasing the line spacing",
        "B": "Placing text in the centre of the slide",
        "C": "Placing text against the left margin"
      }
    }
  },
  {
    "id": "item_21",
    "chapter_key": "chapter-05",
    "objective_key": "picture_layout",
    "th": {
      "prompt": "\u0e04\u0e38\u0e13\u0e2a\u0e21\u0e1a\u0e31\u0e15\u0e34\u0e43\u0e14\u0e43\u0e2a\u0e48\u0e20\u0e32\u0e1e\u0e20\u0e32\u0e22\u0e19\u0e43\u0e23\u0e39\u0e1b\u0e23\u0e48\u0e32\u0e07",
      "choices": {
        "A": "\u0e15\u0e31\u0e27\u0e2b\u0e19\u0e32",
        "B": "Hide Slide",
        "C": "\u0e04\u0e23\u0e2d\u0e1a\u0e23\u0e39\u0e1b\u0e23\u0e48\u0e32\u0e07"
      }
    },
    "en": {
      "prompt": "Which feature puts a picture inside a shape frame?",
      "choices": {
        "A": "Bold",
        "B": "Hide Slide",
        "C": "Crop to Shape"
      }
    }
  },
  {
    "id": "item_22",
    "chapter_key": "chapter-06",
    "objective_key": "create_chart",
    "th": {
      "prompt": "\u0e2b\u0e25\u0e31\u0e07\u0e40\u0e25\u0e37\u0e2d\u0e01 Chart \u0e40\u0e25\u0e37\u0e2d\u0e01\u0e2d\u0e30\u0e44\u0e23\u0e41\u0e23\u0e01",
      "choices": {
        "A": "\u0e0a\u0e19\u0e34\u0e14\u0e41\u0e1c\u0e19\u0e20\u0e39\u0e21\u0e34",
        "B": "\u0e1e\u0e37\u0e49\u0e19\u0e2b\u0e25\u0e31\u0e07\u0e02\u0e2d\u0e07\u0e2a\u0e44\u0e25\u0e14\u0e4c",
        "C": "\u0e41\u0e1a\u0e1a\u0e2d\u0e31\u0e01\u0e29\u0e23"
      }
    },
    "en": {
      "prompt": "After choosing Insert, Chart, what do you choose first?",
      "choices": {
        "A": "The chart type",
        "B": "The slide background",
        "C": "The font"
      }
    }
  },
  {
    "id": "item_23",
    "chapter_key": "chapter-07",
    "objective_key": "table_data",
    "th": {
      "prompt": "\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e41\u0e1a\u0e1a\u0e43\u0e14\u0e44\u0e21\u0e48\u0e40\u0e2b\u0e21\u0e32\u0e30\u0e2a\u0e21\u0e01\u0e31\u0e1a\u0e15\u0e32\u0e23\u0e32\u0e07",
      "choices": {
        "A": "\u0e08\u0e33\u0e19\u0e27\u0e19\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32",
        "B": "\u0e22\u0e48\u0e2d\u0e2b\u0e19\u0e49\u0e32\u0e22\u0e32\u0e27\u0e2b\u0e25\u0e32\u0e22\u0e22\u0e48\u0e2d\u0e2b\u0e19\u0e49\u0e32",
        "C": "\u0e23\u0e32\u0e04\u0e32\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32"
      }
    },
    "en": {
      "prompt": "Which data is NOT suitable for a table?",
      "choices": {
        "A": "Product quantities",
        "B": "Several long paragraphs",
        "C": "Product prices"
      }
    }
  },
  {
    "id": "item_24",
    "chapter_key": "chapter-08",
    "objective_key": "transition_timing",
    "th": {
      "prompt": "\u0e08\u0e30\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e40\u0e21\u0e37\u0e48\u0e2d\u0e04\u0e25\u0e34\u0e01\u0e04\u0e27\u0e23\u0e15\u0e31\u0e49\u0e07\u0e04\u0e48\u0e32\u0e43\u0e14",
      "choices": {
        "A": "\u0e2d\u0e31\u0e15\u0e42\u0e19\u0e21\u0e31\u0e15\u0e34\u0e40\u0e17\u0e48\u0e32\u0e19\u0e31\u0e49\u0e19",
        "B": "\u0e44\u0e21\u0e48\u0e15\u0e49\u0e2d\u0e07\u0e15\u0e31\u0e49\u0e07",
        "C": "\u0e40\u0e21\u0e37\u0e48\u0e2d\u0e04\u0e25\u0e34\u0e01"
      }
    },
    "en": {
      "prompt": "To change a slide on click, which setting do you use?",
      "choices": {
        "A": "Automatic only",
        "B": "No setting",
        "C": "On Click"
      }
    }
  },
  {
    "id": "item_25",
    "chapter_key": "chapter-09",
    "objective_key": "rehearsal",
    "th": {
      "prompt": "\u0e04\u0e27\u0e23\u0e0b\u0e49\u0e2d\u0e21\u0e2d\u0e22\u0e48\u0e32\u0e07\u0e44\u0e23",
      "choices": {
        "A": "\u0e2d\u0e2d\u0e01\u0e40\u0e2a\u0e35\u0e22\u0e07\u0e01\u0e31\u0e1a\u0e19\u0e32\u0e2c\u0e34\u0e01\u0e32\u0e08\u0e31\u0e1a\u0e40\u0e27\u0e25\u0e32",
        "B": "\u0e2d\u0e48\u0e32\u0e19\u0e40\u0e17\u0e48\u0e32\u0e19\u0e31\u0e49\u0e19",
        "C": "\u0e40\u0e1b\u0e34\u0e14 Slide Show \u0e40\u0e17\u0e48\u0e32\u0e19\u0e31\u0e49\u0e19"
      }
    },
    "en": {
      "prompt": "How should you rehearse?",
      "choices": {
        "A": "Out loud, with a timer",
        "B": "By reading only",
        "C": "By opening Slide Show only"
      }
    }
  },
  {
    "id": "item_26",
    "chapter_key": "chapter-01",
    "objective_key": "audience",
    "th": {
      "prompt": "\u0e2d\u0e30\u0e44\u0e23\u0e01\u0e33\u0e2b\u0e19\u0e14\u0e1b\u0e23\u0e34\u0e21\u0e32\u0e13\u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14",
      "choices": {
        "A": "\u0e02\u0e19\u0e32\u0e14\u0e15\u0e31\u0e27\u0e2d\u0e31\u0e01\u0e29\u0e23\u0e17\u0e35\u0e48\u0e04\u0e38\u0e13\u0e0a\u0e2d\u0e1a",
        "B": "\u0e04\u0e27\u0e32\u0e21\u0e23\u0e39\u0e49\u0e41\u0e25\u0e30\u0e04\u0e27\u0e32\u0e21\u0e15\u0e49\u0e2d\u0e07\u0e01\u0e32\u0e23\u0e02\u0e2d\u0e07\u0e1c\u0e39\u0e49\u0e1f\u0e31\u0e07",
        "C": "\u0e08\u0e33\u0e19\u0e27\u0e19\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e43\u0e19\u0e41\u0e21\u0e48\u0e41\u0e1a\u0e1a"
      }
    },
    "en": {
      "prompt": "What should guide the amount of detail you include?",
      "choices": {
        "A": "The font size you like",
        "B": "The audience existing knowledge and needs",
        "C": "The number of slides in the template"
      }
    }
  },
  {
    "id": "item_27",
    "chapter_key": "chapter-02",
    "objective_key": "sb_benefits",
    "th": {
      "prompt": "\u0e2a\u0e15\u0e2d\u0e23\u0e35\u0e1a\u0e2d\u0e23\u0e4c\u0e14\u0e0a\u0e48\u0e27\u0e22\u0e25\u0e14\u0e1b\u0e31\u0e0d\u0e2b\u0e32\u0e2d\u0e30\u0e44\u0e23",
      "choices": {
        "A": "\u0e25\u0e14\u0e08\u0e33\u0e19\u0e27\u0e19\u0e1c\u0e39\u0e49\u0e1f\u0e31\u0e07",
        "B": "\u0e25\u0e14\u0e40\u0e27\u0e25\u0e32\u0e1e\u0e39\u0e14",
        "C": "\u0e25\u0e14\u0e01\u0e32\u0e23\u0e41\u0e01\u0e49\u0e42\u0e04\u0e23\u0e07\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e0b\u0e49\u0e33\u0e2b\u0e25\u0e31\u0e07\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e2a\u0e44\u0e25\u0e14\u0e4c"
      }
    },
    "en": {
      "prompt": "Which problem does a storyboard reduce?",
      "choices": {
        "A": "It reduces the audience size",
        "B": "It reduces speaking time",
        "C": "It reduces structural rework after the slides are built"
      }
    }
  },
  {
    "id": "item_28",
    "chapter_key": "chapter-04",
    "objective_key": "emphasis_limit",
    "th": {
      "prompt": "\u0e16\u0e49\u0e32\u0e40\u0e19\u0e49\u0e19\u0e17\u0e38\u0e01\u0e04\u0e33\u0e08\u0e30\u0e21\u0e35\u0e1c\u0e25\u0e2d\u0e30\u0e44\u0e23",
      "choices": {
        "A": "\u0e44\u0e21\u0e48\u0e21\u0e35\u0e2d\u0e30\u0e44\u0e23\u0e40\u0e14\u0e48\u0e19",
        "B": "\u0e2d\u0e48\u0e32\u0e19\u0e07\u0e48\u0e32\u0e22\u0e02\u0e36\u0e49\u0e19",
        "C": "\u0e44\u0e1f\u0e25\u0e4c\u0e40\u0e25\u0e47\u0e01\u0e25\u0e07"
      }
    },
    "en": {
      "prompt": "If you emphasise every word, what happens?",
      "choices": {
        "A": "Nothing stands out",
        "B": "Reading gets easier",
        "C": "The file gets smaller"
      }
    }
  },
  {
    "id": "item_29",
    "chapter_key": "chapter-05",
    "objective_key": "crop",
    "th": {
      "prompt": "\u0e2b\u0e25\u0e31\u0e07\u0e15\u0e31\u0e14\u0e2a\u0e48\u0e27\u0e19\u0e17\u0e35\u0e48\u0e25\u0e1a\u0e19\u0e2d\u0e01\u0e01\u0e25\u0e32\u0e22\u0e40\u0e1b\u0e47\u0e19\u0e2d\u0e30\u0e44\u0e23",
      "choices": {
        "A": "\u0e01\u0e25\u0e32\u0e22\u0e40\u0e1b\u0e47\u0e19\u0e23\u0e39\u0e1b\u0e23\u0e48\u0e32\u0e07",
        "B": "\u0e16\u0e39\u0e01\u0e0b\u0e48\u0e2d\u0e19\u0e41\u0e15\u0e48\u0e15\u0e31\u0e14\u0e2d\u0e35\u0e01\u0e04\u0e23\u0e31\u0e49\u0e07\u0e01\u0e39\u0e49\u0e04\u0e37\u0e19\u0e44\u0e14\u0e49",
        "C": "\u0e25\u0e1a\u0e08\u0e32\u0e01\u0e04\u0e2d\u0e21\u0e1e\u0e34\u0e27\u0e40\u0e15\u0e2d\u0e23\u0e4c"
      }
    },
    "en": {
      "prompt": "After you crop a picture, what happens to the removed part?",
      "choices": {
        "A": "It becomes a shape",
        "B": "It is hidden but can be recovered by cropping again",
        "C": "It is deleted from the computer"
      }
    }
  },
  {
    "id": "item_30",
    "chapter_key": "chapter-06",
    "objective_key": "chart_data",
    "th": {
      "prompt": "\u0e40\u0e21\u0e37\u0e48\u0e2d\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e15\u0e31\u0e27\u0e40\u0e25\u0e02\u0e43\u0e19\u0e41\u0e1c\u0e48\u0e19\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e08\u0e30\u0e01\u0e25\u0e32\u0e22\u0e40\u0e1b\u0e47\u0e19\u0e2d\u0e30\u0e44\u0e23",
      "choices": {
        "A": "\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e25\u0e1a",
        "B": "\u0e18\u0e35\u0e21\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19",
        "C": "\u0e41\u0e1c\u0e19\u0e20\u0e39\u0e21\u0e34\u0e2d\u0e31\u0e1b\u0e40\u0e14\u0e15\u0e17\u0e31\u0e19\u0e17\u0e35"
      }
    },
    "en": {
      "prompt": "When you change the numbers in the data sheet, what happens?",
      "choices": {
        "A": "The slide is deleted",
        "B": "The theme changes",
        "C": "The chart updates at once"
      }
    }
  },
  {
    "id": "item_31",
    "chapter_key": "chapter-07",
    "objective_key": "table_edit",
    "th": {
      "prompt": "\u0e40\u0e0b\u0e25\u0e25\u0e4c\u0e04\u0e37\u0e2d\u0e2d\u0e30\u0e44\u0e23\u0e43\u0e19\u0e15\u0e32\u0e23\u0e32\u0e07",
      "choices": {
        "A": "\u0e0a\u0e48\u0e2d\u0e07\u0e17\u0e35\u0e48\u0e40\u0e01\u0e34\u0e14\u0e08\u0e32\u0e01\u0e41\u0e16\u0e27\u0e41\u0e25\u0e30\u0e04\u0e2d\u0e25\u0e31\u0e21\u0e19\u0e4c",
        "B": "\u0e15\u0e32\u0e23\u0e32\u0e07\u0e17\u0e31\u0e49\u0e07\u0e2b\u0e21\u0e14",
        "C": "\u0e2b\u0e31\u0e27\u0e02\u0e49\u0e2d\u0e2a\u0e44\u0e25\u0e14\u0e4c"
      }
    },
    "en": {
      "prompt": "What is a cell in a table?",
      "choices": {
        "A": "The box where a row and a column meet",
        "B": "The whole table",
        "C": "The slide heading"
      }
    }
  },
  {
    "id": "item_32",
    "chapter_key": "chapter-08",
    "objective_key": "animation_purpose",
    "th": {
      "prompt": "\u0e41\u0e2d\u0e19\u0e34\u0e40\u0e21\u0e0a\u0e31\u0e19\u0e21\u0e32\u0e01\u0e40\u0e01\u0e34\u0e19\u0e44\u0e1b\u0e17\u0e33\u0e43\u0e2b\u0e49\u0e40\u0e01\u0e34\u0e14\u0e2d\u0e30\u0e44\u0e23",
      "choices": {
        "A": "\u0e25\u0e14\u0e08\u0e33\u0e19\u0e27\u0e19\u0e2a\u0e44\u0e25\u0e14\u0e4c",
        "B": "\u0e23\u0e1a\u0e01\u0e27\u0e19\u0e40\u0e19\u0e37\u0e49\u0e2d\u0e2b\u0e32",
        "C": "\u0e0a\u0e48\u0e27\u0e22\u0e08\u0e33\u0e17\u0e31\u0e49\u0e07\u0e2b\u0e21\u0e14"
      }
    },
    "en": {
      "prompt": "What does too much animation cause?",
      "choices": {
        "A": "It reduces the number of slides",
        "B": "It distracts from the content",
        "C": "It helps the audience remember everything"
      }
    }
  },
  {
    "id": "item_33",
    "chapter_key": "chapter-09",
    "objective_key": "support_docs_types",
    "th": {
      "prompt": "\u0e02\u0e49\u0e2d\u0e43\u0e14\u0e44\u0e21\u0e48\u0e43\u0e0a\u0e48\u0e40\u0e2d\u0e01\u0e2a\u0e32\u0e23\u0e1b\u0e23\u0e30\u0e01\u0e2d\u0e1a",
      "choices": {
        "A": "\u0e40\u0e2d\u0e01\u0e2a\u0e32\u0e23\u0e41\u0e08\u0e01",
        "B": "\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19",
        "C": "\u0e2d\u0e38\u0e1b\u0e01\u0e23\u0e13\u0e4c\u0e2a\u0e33\u0e2b\u0e23\u0e31\u0e1a\u0e19\u0e33\u0e40\u0e2a\u0e19\u0e2d"
      }
    },
    "en": {
      "prompt": "Which item is NOT a supporting document?",
      "choices": {
        "A": "A handout",
        "B": "A report",
        "C": "The presenting equipment"
      }
    }
  },
  {
    "id": "item_34",
    "chapter_key": "chapter-01",
    "objective_key": "structure",
    "th": {
      "prompt": "\u0e42\u0e04\u0e23\u0e07\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e07\u0e48\u0e32\u0e22 \u0e2a\u0e33\u0e2b\u0e23\u0e31\u0e1a\u0e01\u0e32\u0e23\u0e1e\u0e39\u0e14\u0e04\u0e37\u0e2d\u0e2d\u0e30\u0e44\u0e23",
      "choices": {
        "A": "\u0e1a\u0e17\u0e19\u0e33 \u0e40\u0e19\u0e37\u0e49\u0e2d\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07 \u0e1a\u0e17\u0e2a\u0e23\u0e38\u0e1b",
        "B": "\u0e1a\u0e17\u0e2a\u0e23\u0e38\u0e1b\u0e40\u0e17\u0e48\u0e32\u0e19\u0e31\u0e49\u0e19",
        "C": "\u0e25\u0e33\u0e14\u0e31\u0e1a\u0e2a\u0e38\u0e48\u0e21"
      }
    },
    "en": {
      "prompt": "A simple structure for a talk is...",
      "choices": {
        "A": "introduction, body, conclusion",
        "B": "conclusion only",
        "C": "random order"
      }
    }
  },
  {
    "id": "item_35",
    "chapter_key": "chapter-02",
    "objective_key": "sb_sequence",
    "th": {
      "prompt": "\u0e01\u0e23\u0e2d\u0e1a\u0e1b\u0e34\u0e14\u0e04\u0e27\u0e23\u0e17\u0e33\u0e2d\u0e30\u0e44\u0e23",
      "choices": {
        "A": "\u0e40\u0e1e\u0e34\u0e48\u0e21\u0e1b\u0e23\u0e30\u0e40\u0e14\u0e47\u0e19\u0e43\u0e2b\u0e21\u0e48",
        "B": "\u0e22\u0e49\u0e33\u0e2a\u0e32\u0e23\u0e30\u0e2b\u0e25\u0e31\u0e01\u0e41\u0e25\u0e30\u0e1a\u0e2d\u0e01\u0e02\u0e31\u0e49\u0e19\u0e15\u0e2d\u0e19\u0e15\u0e2d\u0e44\u0e1b",
        "C": "\u0e17\u0e1a\u0e17\u0e27\u0e19\u0e17\u0e38\u0e01\u0e01\u0e23\u0e2d\u0e1a"
      }
    },
    "en": {
      "prompt": "What should the closing frame do?",
      "choices": {
        "A": "Add a new point",
        "B": "Repeat the main message and give the next step",
        "C": "Review every frame again"
      }
    }
  },
  {
    "id": "item_36",
    "chapter_key": "chapter-03",
    "objective_key": "window_parts",
    "th": {
      "prompt": "\u0e2a\u0e48\u0e27\u0e19\u0e43\u0e14\u0e43\u0e0a\u0e49\u0e41\u0e2a\u0e14\u0e07\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e1c\u0e39\u0e49\u0e1a\u0e23\u0e23\u0e22\u0e32\u0e22",
      "choices": {
        "A": "\u0e23\u0e34\u0e1a\u0e1a\u0e2d\u0e19",
        "B": "\u0e1e\u0e37\u0e49\u0e19\u0e17\u0e35\u0e48\u0e41\u0e01\u0e49\u0e44\u0e02",
        "C": "\u0e1a\u0e32\u0e19\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01"
      }
    },
    "en": {
      "prompt": "Which part shows the speaker notes?",
      "choices": {
        "A": "The ribbon",
        "B": "The editing area",
        "C": "The notes pane"
      }
    }
  },
  {
    "id": "item_37",
    "chapter_key": "chapter-05",
    "objective_key": "shapes_insert",
    "th": {
      "prompt": "\u0e41\u0e01\u0e25\u0e40\u0e25\u0e2d\u0e23\u0e35\u0e23\u0e39\u0e1b\u0e23\u0e48\u0e32\u0e07\u0e21\u0e35\u0e23\u0e39\u0e1b\u0e23\u0e48\u0e32\u0e07\u0e41\u0e1a\u0e1a\u0e43\u0e14",
      "choices": {
        "A": "\u0e25\u0e39\u0e01\u0e28\u0e23\u0e41\u0e25\u0e30\u0e01\u0e25\u0e48\u0e2d\u0e07\u0e04\u0e33\u0e1e\u0e39\u0e14",
        "B": "\u0e41\u0e1a\u0e1a\u0e2d\u0e31\u0e01\u0e29\u0e23\u0e41\u0e25\u0e30\u0e02\u0e19\u0e32\u0e14\u0e15\u0e31\u0e27\u0e2d\u0e31\u0e01\u0e29\u0e23",
        "C": "\u0e18\u0e35\u0e21\u0e41\u0e25\u0e30\u0e2a\u0e35"
      }
    },
    "en": {
      "prompt": "Which kind of shape is in the Shapes gallery?",
      "choices": {
        "A": "Arrows and callouts",
        "B": "Fonts and letter sizes",
        "C": "Themes and colours"
      }
    }
  },
  {
    "id": "item_38",
    "chapter_key": "chapter-06",
    "objective_key": "chart_elements",
    "th": {
      "prompt": "\u0e2d\u0e07\u0e04\u0e4c\u0e1b\u0e23\u0e30\u0e01\u0e2d\u0e1a\u0e43\u0e14\u0e41\u0e2a\u0e14\u0e07\u0e04\u0e48\u0e32\u0e02\u0e2d\u0e07\u0e08\u0e38\u0e14\u0e41\u0e15\u0e25\u0e30",
      "choices": {
        "A": "\u0e40\u0e2a\u0e49\u0e19\u0e15\u0e32\u0e23\u0e32\u0e07",
        "B": "\u0e1b\u0e49\u0e32\u0e22\u0e01\u0e33\u0e01\u0e31\u0e1a\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25",
        "C": "\u0e04\u0e33\u0e2d\u0e18\u0e34\u0e1a\u0e32\u0e22"
      }
    },
    "en": {
      "prompt": "Which element shows the value of each point?",
      "choices": {
        "A": "The gridlines",
        "B": "The data labels",
        "C": "The legend"
      }
    }
  },
  {
    "id": "item_39",
    "chapter_key": "chapter-07",
    "objective_key": "diagram_purpose",
    "th": {
      "prompt": "\u0e2b\u0e19\u0e49\u0e32\u0e17\u0e35\u0e48\u0e2b\u0e25\u0e31\u0e01\u0e02\u0e2d\u0e07\u0e41\u0e1c\u0e19\u0e20\u0e32\u0e1e\u0e04\u0e37\u0e2d\u0e2d\u0e30\u0e44\u0e23",
      "choices": {
        "A": "\u0e17\u0e33\u0e43\u0e2b\u0e49\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e22\u0e32\u0e27",
        "B": "\u0e41\u0e17\u0e19\u0e17\u0e35\u0e48\u0e1c\u0e39\u0e49\u0e1a\u0e23\u0e23\u0e22\u0e32\u0e22",
        "C": "\u0e22\u0e48\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e04\u0e34\u0e14\u0e43\u0e2b\u0e49\u0e40\u0e2b\u0e47\u0e19\u0e42\u0e04\u0e23\u0e07\u0e2a\u0e23\u0e49\u0e32\u0e07"
      }
    },
    "en": {
      "prompt": "What is the main job of a diagram?",
      "choices": {
        "A": "Making the slide longer",
        "B": "Replacing the speaker",
        "C": "Reducing an idea so its structure is visible"
      }
    }
  },
  {
    "id": "item_40",
    "chapter_key": "chapter-08",
    "objective_key": "animation_apply",
    "th": {
      "prompt": "\u0e40\u0e2d\u0e1f\u0e40\u0e1f\u0e01\u0e15\u0e4c\u0e17\u0e32\u0e07\u0e40\u0e02\u0e49\u0e32\u0e17\u0e33\u0e43\u0e2b\u0e49\u0e40\u0e01\u0e34\u0e14\u0e2d\u0e30\u0e44\u0e23",
      "choices": {
        "A": "\u0e17\u0e33\u0e43\u0e2b\u0e49\u0e27\u0e31\u0e15\u0e16\u0e38\u0e1b\u0e23\u0e32\u0e01\u0e0f",
        "B": "\u0e17\u0e33\u0e43\u0e2b\u0e49\u0e27\u0e31\u0e15\u0e16\u0e38\u0e2b\u0e32\u0e22",
        "C": "\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e2a\u0e35\u0e16\u0e32\u0e27\u0e23"
      }
    },
    "en": {
      "prompt": "What does an entrance effect do?",
      "choices": {
        "A": "Makes an object appear",
        "B": "Makes an object disappear",
        "C": "Changes the colour permanently"
      }
    }
  },
  {
    "id": "item_41",
    "chapter_key": "chapter-09",
    "objective_key": "handout_export",
    "th": {
      "prompt": "\u0e1c\u0e25\u0e25\u0e31\u0e1e\u0e18\u0e4c\u0e43\u0e14\u0e04\u0e27\u0e23\u0e43\u0e2b\u0e49\u0e1c\u0e39\u0e49\u0e1f\u0e31\u0e07\u0e17\u0e35\u0e48\u0e2d\u0e48\u0e32\u0e19\u0e44\u0e1f\u0e25\u0e4c\u0e20\u0e32\u0e22\u0e2b\u0e25\u0e31\u0e07",
      "choices": {
        "A": "\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e22\u0e48\u0e2d",
        "B": "\u0e2a\u0e48\u0e07\u0e2d\u0e2d\u0e01 PDF",
        "C": "\u0e44\u0e1f\u0e25\u0e4c\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e17\u0e35\u0e48\u0e41\u0e01\u0e49\u0e44\u0e02\u0e44\u0e14\u0e49"
      }
    },
    "en": {
      "prompt": "Which output should you give an audience that will read the file later?",
      "choices": {
        "A": "The notes page",
        "B": "An exported PDF",
        "C": "The editable slide file"
      }
    }
  },
  {
    "id": "item_42",
    "chapter_key": "chapter-01",
    "objective_key": "principles",
    "th": {
      "prompt": "\u0e02\u0e49\u0e2d\u0e43\u0e14\u0e17\u0e33\u0e25\u0e32\u0e22\u0e04\u0e27\u0e32\u0e21\u0e2a\u0e21\u0e48\u0e33\u0e40\u0e2a\u0e21\u0e2d\u0e02\u0e2d\u0e07\u0e0a\u0e38\u0e14\u0e2a\u0e44\u0e25\u0e14\u0e4c",
      "choices": {
        "A": "\u0e43\u0e0a\u0e49\u0e0a\u0e38\u0e14\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e2a\u0e35\u0e40\u0e14\u0e35\u0e22\u0e27",
        "B": "\u0e43\u0e0a\u0e49\u0e23\u0e39\u0e1b\u0e41\u0e1a\u0e1a\u0e2b\u0e31\u0e27\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e40\u0e14\u0e34\u0e21",
        "C": "\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e2a\u0e35\u0e41\u0e25\u0e30\u0e41\u0e1a\u0e1a\u0e2d\u0e31\u0e01\u0e29\u0e23\u0e17\u0e38\u0e01\u0e2a\u0e44\u0e25\u0e14\u0e4c"
      }
    },
    "en": {
      "prompt": "Which choice breaks a deck''s consistency?",
      "choices": {
        "A": "Keeping one colour palette",
        "B": "Reusing the same heading style",
        "C": "Changing colours and fonts on every slide"
      }
    }
  },
  {
    "id": "item_43",
    "chapter_key": "chapter-02",
    "objective_key": "sb_visuals",
    "th": {
      "prompt": "\u0e02\u0e49\u0e2d\u0e43\u0e14\u0e04\u0e37\u0e2d\u0e01\u0e32\u0e23\u0e27\u0e32\u0e07\u0e20\u0e32\u0e1e\u0e17\u0e35\u0e48\u0e14\u0e35",
      "choices": {
        "A": "\u0e43\u0e0a\u0e49\u0e20\u0e32\u0e1e\u0e2b\u0e19\u0e36\u0e07\u0e20\u0e32\u0e1e\u0e17\u0e35\u0e48\u0e0a\u0e48\u0e27\u0e22\u0e2b\u0e43\u0e49\u0e2a\u0e32\u0e23\u0e30\u0e2b\u0e25\u0e31\u0e01\u0e0a\u0e31\u0e14\u0e40\u0e08\u0e19\u0e02\u0e36\u0e49\u0e19",
        "B": "\u0e43\u0e0a\u0e49\u0e20\u0e32\u0e1e\u0e17\u0e35\u0e48\u0e44\u0e21\u0e48\u0e40\u0e01\u0e35\u0e48\u0e22\u0e27\u0e01\u0e31\u0e1a\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07",
        "C": "\u0e43\u0e2a\u0e48\u0e20\u0e32\u0e1e\u0e17\u0e38\u0e01\u0e20\u0e32\u0e1e\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e2b\u0e25\u0e32\u0e01\u0e2b\u0e25\u0e32\u0e22"
      }
    },
    "en": {
      "prompt": "Which is good visual placement?",
      "choices": {
        "A": "Use one image that makes the main message clearer",
        "B": "Use an image unrelated to the topic",
        "C": "Put in every image for variety"
      }
    }
  },
  {
    "id": "item_44",
    "chapter_key": "chapter-03",
    "objective_key": "slide_master",
    "th": {
      "prompt": "\u0e16\u0e49\u0e32\u0e41\u0e01\u0e49\u0e44\u0e02\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e15\u0e49\u0e19\u0e41\u0e1a\u0e1a\u0e08\u0e30\u0e21\u0e35\u0e1c\u0e25\u0e2d\u0e30\u0e44\u0e23",
      "choices": {
        "A": "\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e40\u0e09\u0e1e\u0e32\u0e30\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e17\u0e35\u0e48\u0e40\u0e25\u0e37\u0e2d\u0e01",
        "B": "\u0e17\u0e38\u0e01\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e15\u0e32\u0e21",
        "C": "\u0e44\u0e21\u0e48\u0e21\u0e35\u0e2d\u0e30\u0e44\u0e23\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19"
      }
    },
    "en": {
      "prompt": "What happens if you edit the Slide Master?",
      "choices": {
        "A": "Only the selected slide changes",
        "B": "Every slide changes with it",
        "C": "Nothing changes"
      }
    }
  },
  {
    "id": "item_45",
    "chapter_key": "chapter-04",
    "objective_key": "slide_order",
    "th": {
      "prompt": "\u0e40\u0e2b\u0e15\u0e38\u0e43\u0e14\u0e08\u0e36\u0e07\u0e15\u0e49\u0e2d\u0e07\u0e40\u0e23\u0e35\u0e22\u0e07\u0e2a\u0e44\u0e25\u0e14\u0e4c",
      "choices": {
        "A": "\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e43\u0e2b\u0e49\u0e44\u0e1f\u0e25\u0e4c\u0e43\u0e2b\u0e0d\u0e48\u0e02\u0e36\u0e49\u0e19",
        "B": "\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e43\u0e2b\u0e49\u0e25\u0e14\u0e08\u0e33\u0e19\u0e27\u0e19\u0e2a\u0e44\u0e25\u0e14\u0e4c",
        "C": "\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e43\u0e2b\u0e49\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e15\u0e48\u0e2d\u0e40\u0e19\u0e37\u0e48\u0e2d\u0e07\u0e41\u0e25\u0e30\u0e1c\u0e39\u0e49\u0e1f\u0e31\u0e07\u0e15\u0e32\u0e21\u0e44\u0e14\u0e49"
      }
    },
    "en": {
      "prompt": "Why should slides be put in order?",
      "choices": {
        "A": "So the file gets larger",
        "B": "So the number of slides goes down",
        "C": "So the story flows and the audience can follow"
      }
    }
  },
  {
    "id": "item_46",
    "chapter_key": "chapter-06",
    "objective_key": "axis_labels",
    "th": {
      "prompt": "\u0e41\u0e01\u0e19\u0e43\u0e14\u0e1a\u0e48\u0e2d\u0e22\u0e41\u0e2a\u0e14\u0e07\u0e04\u0e48\u0e32\u0e2b\u0e23\u0e37\u0e2d\u0e15\u0e31\u0e27\u0e40\u0e25\u0e02",
      "choices": {
        "A": "\u0e41\u0e01\u0e19\u0e15\u0e31\u0e49\u0e07",
        "B": "\u0e41\u0e01\u0e19\u0e19\u0e2d\u0e19",
        "C": "\u0e04\u0e33\u0e2d\u0e18\u0e34\u0e1a\u0e32\u0e22"
      }
    },
    "en": {
      "prompt": "Which axis usually shows the values or numbers?",
      "choices": {
        "A": "The vertical axis",
        "B": "The horizontal axis",
        "C": "The legend"
      }
    }
  },
  {
    "id": "item_47",
    "chapter_key": "chapter-08",
    "objective_key": "animation_pane",
    "th": {
      "prompt": "\u0e15\u0e49\u0e2d\u0e07\u0e01\u0e32\u0e23\u0e22\u0e49\u0e32\u0e22\u0e41\u0e2d\u0e19\u0e34\u0e40\u0e21\u0e0a\u0e31\u0e19\u0e43\u0e2b\u0e49\u0e01\u0e48\u0e2d\u0e19\u0e04\u0e27\u0e23\u0e17\u0e33\u0e2d\u0e22\u0e48\u0e32\u0e07\u0e44\u0e23",
      "choices": {
        "A": "\u0e41\u0e17\u0e23\u0e01\u0e15\u0e32\u0e23\u0e32\u0e07",
        "B": "\u0e08\u0e31\u0e14\u0e27\u0e32\u0e07\u0e25\u0e33\u0e14\u0e31\u0e1a\u0e43\u0e19\u0e41\u0e1c\u0e07\u0e41\u0e2d\u0e19\u0e34\u0e40\u0e21\u0e0a\u0e31\u0e19",
        "C": "\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e18\u0e35\u0e21"
      }
    },
    "en": {
      "prompt": "You want to move an animation earlier. What should you do?",
      "choices": {
        "A": "Insert a table",
        "B": "Reorder it in the Animation Pane",
        "C": "Change the theme"
      }
    }
  },
  {
    "id": "item_48",
    "chapter_key": "chapter-01",
    "objective_key": "preparation",
    "th": {
      "prompt": "\u0e16\u0e49\u0e32\u0e15\u0e2d\u0e1a\u0e04\u0e33\u0e16\u0e32\u0e21\u0e1c\u0e39\u0e49\u0e1f\u0e31\u0e07\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49\u0e04\u0e27\u0e23\u0e17\u0e33\u0e2d\u0e22\u0e32\u0e07\u0e44\u0e23",
      "choices": {
        "A": "\u0e04\u0e34\u0e14\u0e04\u0e33\u0e15\u0e2d\u0e1a\u0e02\u0e36\u0e49\u0e19\u0e21\u0e32\u0e40\u0e23\u0e47\u0e27 \u0e46",
        "B": "\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07",
        "C": "\u0e1a\u0e2d\u0e01\u0e27\u0e48\u0e32\u0e08\u0e30\u0e15\u0e34\u0e14\u0e15\u0e32\u0e21\u0e1c\u0e25\u0e25\u0e31\u0e1e\u0e18\u0e4c\u0e41\u0e25\u0e30\u0e17\u0e33\u0e08\u0e23\u0e34\u0e07"
      }
    },
    "en": {
      "prompt": "If you cannot answer an audience question, what should you do?",
      "choices": {
        "A": "Invent an answer quickly",
        "B": "Change the subject",
        "C": "Say you will follow up and then do it"
      }
    }
  },
  {
    "id": "item_49",
    "chapter_key": "chapter-02",
    "objective_key": "sb_preparation",
    "th": {
      "prompt": "\u0e40\u0e19\u0e37\u0e49\u0e2d\u0e2b\u0e32\u0e43\u0e19\u0e2a\u0e15\u0e2d\u0e23\u0e35\u0e1a\u0e2d\u0e23\u0e4c\u0e14\u0e04\u0e27\u0e23\u0e21\u0e32\u0e08\u0e32\u0e01\u0e17\u0e35\u0e48\u0e44\u0e2b\u0e19",
      "choices": {
        "A": "\u0e41\u0e2b\u0e25\u0e48\u0e07\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e17\u0e35\u0e48\u0e40\u0e0a\u0e37\u0e48\u0e2d\u0e16\u0e37\u0e2d\u0e44\u0e14\u0e49\u0e41\u0e25\u0e30\u0e15\u0e23\u0e07\u0e01\u0e31\u0e1a\u0e40\u0e1b\u0e49\u0e32\u0e2b\u0e21\u0e32\u0e22",
        "B": "\u0e17\u0e38\u0e01\u0e44\u0e1f\u0e25\u0e4c\u0e17\u0e35\u0e48\u0e21\u0e35",
        "C": "\u0e04\u0e27\u0e32\u0e21\u0e04\u0e34\u0e14\u0e40\u0e2b\u0e47\u0e19\u0e2a\u0e48\u0e27\u0e19\u0e15\u0e31\u0e27\u0e40\u0e17\u0e48\u0e32\u0e19\u0e31\u0e49\u0e19"
      }
    },
    "en": {
      "prompt": "Where should storyboard content come from?",
      "choices": {
        "A": "Reliable sources that match the goal",
        "B": "Every file you have",
        "C": "Personal opinion only"
      }
    }
  },
  {
    "id": "item_50",
    "chapter_key": "chapter-03",
    "objective_key": "layout",
    "th": {
      "prompt": "\u0e40\u0e04\u0e49\u0e32\u0e42\u0e04\u0e23\u0e07\u0e2a\u0e44\u0e25\u0e14\u0e4c\u0e02\u0e49\u0e2d\u0e43\u0e14\u0e40\u0e2b\u0e21\u0e32\u0e30\u0e2a\u0e21\u0e2a\u0e33\u0e2b\u0e23\u0e31\u0e1a\u0e40\u0e1b\u0e23\u0e35\u0e22\u0e1a\u0e40\u0e17\u0e35\u0e22\u0e1a\u0e2a\u0e2d\u0e07\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07",
      "choices": {
        "A": "\u0e40\u0e04\u0e49\u0e32\u0e42\u0e04\u0e23\u0e07\u0e0a\u0e37\u0e48\u0e2d\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e2d\u0e22\u0e48\u0e32\u0e07\u0e40\u0e14\u0e35\u0e22\u0e27",
        "B": "\u0e2a\u0e2d\u0e07\u0e04\u0e2d\u0e25\u0e31\u0e21\u0e19\u0e4c",
        "C": "\u0e40\u0e04\u0e49\u0e32\u0e42\u0e04\u0e23\u0e07\u0e27\u0e48\u0e32\u0e07\u0e40\u0e1b\u0e25\u0e48\u0e32"
      }
    },
    "en": {
      "prompt": "Which layout suits comparing two things?",
      "choices": {
        "A": "A title-only layout",
        "B": "A two-column layout",
        "C": "A blank layout"
      }
    }
  }
]'::jsonb,
  '{
  "item_1": "A",
  "item_2": "B",
  "item_3": "C",
  "item_4": "A",
  "item_5": "B",
  "item_6": "C",
  "item_7": "A",
  "item_8": "B",
  "item_9": "C",
  "item_10": "A",
  "item_11": "B",
  "item_12": "C",
  "item_13": "A",
  "item_14": "B",
  "item_15": "C",
  "item_16": "A",
  "item_17": "B",
  "item_18": "C",
  "item_19": "A",
  "item_20": "B",
  "item_21": "C",
  "item_22": "A",
  "item_23": "B",
  "item_24": "C",
  "item_25": "A",
  "item_26": "B",
  "item_27": "C",
  "item_28": "A",
  "item_29": "B",
  "item_30": "C",
  "item_31": "A",
  "item_32": "B",
  "item_33": "C",
  "item_34": "A",
  "item_35": "B",
  "item_36": "C",
  "item_37": "A",
  "item_38": "B",
  "item_39": "C",
  "item_40": "A",
  "item_41": "B",
  "item_42": "C",
  "item_43": "A",
  "item_44": "B",
  "item_45": "C",
  "item_46": "A",
  "item_47": "B",
  "item_48": "C",
  "item_49": "A",
  "item_50": "B"
}'::jsonb
)
on conflict (version) do update
  set items = excluded.items,
      answer_key = excluded.answer_key,
      seeded_at = now();

-- The key column is server-side only: row-level security limits which
-- learners may read the instrument row; the column grants keep answer_key out
-- of every client read (the submit function reads it as the definer/owner).
revoke select on public.ppg_posttest_instruments from anon, authenticated;
grant select (version, items) on public.ppg_posttest_instruments to authenticated;

-- ----------------------------------------------------------------------------
-- Retry attempts: the FIRST attempt stays in ppg_posttest_responses; every
-- later attempt is a new row here. No client INSERT policy — only the gated
-- definer starter creates retry rows.
-- ----------------------------------------------------------------------------
create table public.ppg_posttest_retry_attempts (
  learner_id uuid not null references auth.users (id) on delete cascade,
  attempt_no integer not null,
  instrument_version text not null references public.ppg_posttest_instruments (version) on delete restrict,
  language text not null,
  answers jsonb,
  autosave_state jsonb not null default '{}'::jsonb,
  score integer,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  primary key (learner_id, attempt_no),
  constraint ppg_posttest_retry_attempt_no_check check (attempt_no >= 2),
  constraint ppg_posttest_retry_language_check check (language in ('th', 'en'))
);

comment on table public.ppg_posttest_retry_attempts is
  'PPGA #84: later Final Test attempts (attempt_no >= 2). The first attempt lives in ppg_posttest_responses and is never overwritten; each submitted row here is immutable once stamped; the best score across all submitted attempts is the displayed score.';

alter table public.ppg_posttest_retry_attempts enable row level security;

create policy ppg_posttest_retry_select on public.ppg_posttest_retry_attempts
  for select
  using (
    (auth.role() = 'learner' and learner_id = auth.uid()
      and public.ppg_posttest_unlocked(auth.uid()))
    or auth.role() = 'teacher'
    or auth.role() = 'admin'
  );

create policy ppg_posttest_retry_update on public.ppg_posttest_retry_attempts
  for update
  using (
    (auth.role() = 'learner' and learner_id = auth.uid() and submitted_at IS NULL)
    or auth.role() = 'admin'
  )
  with check (
    (auth.role() = 'learner' and learner_id = auth.uid() and submitted_at IS NULL)
    or (auth.role() = 'admin' and submitted_at IS NULL)
  );

-- INSERT / DELETE: no policy — retry rows are created only by the definer
-- starter and can never be deleted by a client (append-only research).

create or replace function public.ppg_posttest_retry_immutable()
returns trigger
language plpgsql
as $$
begin
  if old.submitted_at IS NOT NULL then
    raise exception 'already_submitted: the attempt is immutable once submitted; retries append, they never overwrite (ADR-0002)';
  end if;
  return new;
end;
$$;

drop trigger if exists ppg_posttest_retry_immutable on public.ppg_posttest_retry_attempts;
create trigger ppg_posttest_retry_immutable
  before update on public.ppg_posttest_retry_attempts
  for each row
  execute function public.ppg_posttest_retry_immutable();

-- ----------------------------------------------------------------------------
-- The gated starter: creates the research row (attempt 1), or resumes the
-- open attempt, or opens the next retry (attempt_no = max + 1) after the
-- research row is submitted. Idempotent across route retries.
-- ----------------------------------------------------------------------------
create or replace function public.ppg_posttest_start(p_language text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_version text;
  v_first_submitted timestamptz;
  v_latest integer;
begin
  if auth.role() != 'learner' then
    raise exception 'permission_denied: ppg_posttest_start is learner-only (JWT role claim must be learner)';
  end if;
  if p_language is null or p_language not in ('th','en') then
    raise exception 'language_denied: the taken language is th|en ONLY';
  end if;
  if not public.ppg_posttest_unlocked(auth.uid()) then
    raise exception 'final_project_not_accepted: the Final Test unlocks ONLY on the Final Project''s acceptance';
  end if;

  select i.version into v_version
    from public.ppg_posttest_instruments i
   order by i.version desc
   limit 1;
  if v_version is null then
    raise exception 'instrument_missing: no seeded Final Test instrument to start';
  end if;

  -- Attempt 1 is the research row.
  insert into public.ppg_posttest_responses (learner_id, instrument_version, language)
    values (auth.uid(), v_version, p_language)
  on conflict (learner_id) do nothing;

  -- An open research row may still point at an older test version; keep it
  -- current until it is submitted.
  update public.ppg_posttest_responses
     set instrument_version = v_version
   where learner_id = auth.uid()
     and submitted_at IS NULL
     and instrument_version <> v_version;

  select submitted_at into v_first_submitted
    from public.ppg_posttest_responses
   where learner_id = auth.uid();

  if v_first_submitted IS NULL then
    return; -- still on attempt 1
  end if;

  -- Retries: resume the newest open retry, otherwise open the next one.
  select max(attempt_no) into v_latest
    from public.ppg_posttest_retry_attempts
   where learner_id = auth.uid();

  if v_latest IS NULL then
    insert into public.ppg_posttest_retry_attempts
      (learner_id, attempt_no, instrument_version, language)
    values (auth.uid(), 2, v_version, p_language);
    return;
  end if;

  if exists (
    select 1 from public.ppg_posttest_retry_attempts
     where learner_id = auth.uid()
       and attempt_no = v_latest
       and submitted_at IS NULL
  ) then
    return; -- resume the open retry
  end if;

  insert into public.ppg_posttest_retry_attempts
    (learner_id, attempt_no, instrument_version, language)
  values (auth.uid(), v_latest + 1, v_version, p_language);
end;
$$;

revoke execute on function public.ppg_posttest_start(text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_posttest_start(text)
  to service_role, authenticated;

comment on function public.ppg_posttest_start(text) is
  'PPGA #84: creates/resumes the research attempt and opens retries after the first submit. Learner-only, unlock-gated, server-side version, idempotent.';

-- ----------------------------------------------------------------------------
-- Autosave: writes the open attempt only (attempt 1 while it is open,
-- otherwise the newest open retry).
-- ----------------------------------------------------------------------------
create or replace function public.ppg_posttest_upsert(p_autosave jsonb)
returns void
language plpgsql
security invoker
set search_path = public, auth
as $$
begin
  update public.ppg_posttest_responses
     set autosave_state = coalesce(p_autosave, '{}'::jsonb)
   where learner_id = auth.uid()
     and submitted_at IS NULL;

  if not found then
    update public.ppg_posttest_retry_attempts
       set autosave_state = coalesce(p_autosave, '{}'::jsonb)
     where learner_id = auth.uid()
       and submitted_at IS NULL
       and attempt_no = (
         select max(attempt_no) from public.ppg_posttest_retry_attempts
          where learner_id = auth.uid() and submitted_at IS NULL
       );
  end if;
end;
$$;

revoke execute on function public.ppg_posttest_upsert(jsonb)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_posttest_upsert(jsonb)
  to service_role, authenticated;

-- ----------------------------------------------------------------------------
-- Submit: scores the OPEN attempt from the server-side key, stamps it
-- immutably, and calls the #76 reward helper exactly once. A retry appends a
-- row; the research row is never overwritten.
-- ----------------------------------------------------------------------------
create or replace function public.ppg_posttest_submit(p_answers jsonb)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_first_open boolean := false;
  v_attempt_no integer;
  v_version text;
  v_answer_key jsonb;
  v_score integer;
begin
  if auth.role() != 'learner' then
    raise exception 'permission_denied: ppg_posttest_submit is learner-only (JWT role claim must be learner)';
  end if;
  if not public.ppg_posttest_unlocked(auth.uid()) then
    raise exception 'final_project_not_accepted: the Final Test unlocks ONLY on the Final Project''s acceptance';
  end if;

  select true, instrument_version into v_first_open, v_version
    from public.ppg_posttest_responses
   where learner_id = auth.uid()
     and submitted_at IS NULL;

  if not found then
    v_first_open := false;
    select attempt_no, instrument_version into v_attempt_no, v_version
      from public.ppg_posttest_retry_attempts
     where learner_id = auth.uid()
       and submitted_at IS NULL
     order by attempt_no desc
     limit 1;
  end if;

  if v_version IS NULL then
    raise exception 'response_missing: no open Final Test attempt to submit (call ppg_posttest_start first)';
  end if;

  SELECT i.answer_key INTO v_answer_key
    FROM public.ppg_posttest_instruments i
   WHERE i.version = v_version;
  if v_answer_key IS NULL then
    raise exception 'instrument_missing: no answer key for instrument %', v_version;
  end if;

  v_score = (
    select count(*)
      from jsonb_each_text(v_answer_key) a
     where exists (
      select 1
        from jsonb_each_text(p_answers) p
       where p.key = a.key
         and p.value = a.value
    )
  );

  if v_first_open then
    update public.ppg_posttest_responses r
       set answers = p_answers,
           score = v_score,
           submitted_at = now()
     where r.learner_id = auth.uid()
       and r.submitted_at IS NULL;
  else
    update public.ppg_posttest_retry_attempts r
       set answers = p_answers,
           score = v_score,
           submitted_at = now()
     where r.learner_id = auth.uid()
       and r.attempt_no = v_attempt_no
       and r.submitted_at IS NULL;
  end if;

  if not found then
    raise exception 'already_submitted_or_missing: no open attempt to submit (a retry appends, it never overwrites)';
  end if;

  -- The one-time completion reward: 400 XP + final_test_complete, idempotent
  -- by the ledger PK and award PK, so repeated attempts grant nothing more.
  perform public.ppg_grant_final_test_reward(auth.uid(), 'final-test');

  return v_score;
end;
$$;

revoke execute on function public.ppg_posttest_submit(jsonb)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_posttest_submit(jsonb)
  to service_role, authenticated;

comment on function public.ppg_posttest_submit(jsonb) is
  'PPGA #84: scores the open attempt server-side, stamps it immutably, and calls ppg_grant_final_test_reward once per submitted attempt (the helper is idempotent). The first attempt is never overwritten by later retries.';

-- ----------------------------------------------------------------------------
-- End-of-course state for the dashboard/course map (#86 renders it).
-- first_score = the research measure; best_score = what the learner sees;
-- reward_granted/reward_xp/badge_granted prove the one-time award.
-- ----------------------------------------------------------------------------
create or replace function public.ppg_final_test_state(p_learner uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_learner uuid := coalesce(p_learner, auth.uid());
  v_first_score integer;
  v_first_version text;
  v_first_at timestamptz;
  v_best integer;
  v_attempts integer;
begin
  if v_learner is null then
    raise exception 'learner_required: ppg_final_test_state needs a learner';
  end if;
  if v_learner <> auth.uid() and auth.role() not in ('teacher','admin') then
    raise exception 'permission_denied: a learner may read only their own Final Test state';
  end if;

  select score, instrument_version, submitted_at
    into v_first_score, v_first_version, v_first_at
    from public.ppg_posttest_responses
   where learner_id = v_learner;

  select count(*), max(score)
    into v_attempts, v_best
    from (
      select score from public.ppg_posttest_responses
       where learner_id = v_learner and submitted_at IS NOT NULL
      union all
      select score from public.ppg_posttest_retry_attempts
       where learner_id = v_learner and submitted_at IS NOT NULL
    ) s;

  return jsonb_build_object(
    'completed', coalesce(v_attempts, 0) > 0,
    'first_score', v_first_score,
    'best_score', v_best,
    'attempts', coalesce(v_attempts, 0),
    'instrument_version', v_first_version,
    'first_submitted_at', v_first_at,
    'reward_granted', exists (
      select 1 from public.ppg_xp_ledger
       where learner_id = v_learner and event_type = 'final_test_pass'
    ),
    'reward_xp', coalesce((
      select sum(amount) from public.ppg_xp_ledger
       where learner_id = v_learner and event_type = 'final_test_pass'
    ), 0),
    'badge_granted', exists (
      select 1 from public.ppg_badge_awards
       where learner_id = v_learner and badge_key = 'final_test_complete'
    )
  );
end;
$$;

revoke execute on function public.ppg_final_test_state(uuid)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_final_test_state(uuid)
  to service_role, authenticated;

comment on function public.ppg_final_test_state(uuid) is
  'PPGA #84: end-of-course state for #86 — first_score (research measure), best_score, attempts, and the one-time reward state. A learner reads only their own; teacher/admin may read any.';

-- The retry table is the #84 append stream; the research export and PDF
-- summary keep reading ppg_posttest_responses (attempt 1), so the first
-- submitted score remains the research measure untouched.
