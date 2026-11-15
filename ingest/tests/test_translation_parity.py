import json

from bibleit_ingest.constants import LSG_PATH, USFM_ORDER, WEB_PATH


def test_web_and_lsg_verse_parity() -> None:
    assert WEB_PATH.exists(), f"Missing {WEB_PATH}"
    assert LSG_PATH.exists(), f"Missing {LSG_PATH}"

    web = json.loads(WEB_PATH.read_text())
    lsg = json.loads(LSG_PATH.read_text())

    assert len(web["books"]) == 66
    assert len(lsg["books"]) == 66

    web_verses: dict[tuple[str, int, int], str] = {}
    lsg_verses: dict[tuple[str, int, int], str] = {}

    for b_idx in range(66):
        code = USFM_ORDER[b_idx]
        wb = web["books"][b_idx]
        lb = lsg["books"][b_idx]

        assert wb["nr"] == b_idx + 1
        assert lb["nr"] == b_idx + 1
        assert len(wb["chapters"]) == len(lb["chapters"])

        for c_idx, wch in enumerate(wb["chapters"]):
            lch = lb["chapters"][c_idx]
            ch_num = wch["chapter"]
            assert lch["chapter"] == ch_num
            assert len(wch["verses"]) == len(lch["verses"])

            for v_idx, wv in enumerate(wch["verses"]):
                lv = lch["verses"][v_idx]
                v_num = wv["verse"]
                assert lv["verse"] == v_num
                assert lv["text"].strip(), f"Empty text at {code} {ch_num}:{v_num}"

                web_verses[(code, ch_num, v_num)] = wv["text"]
                lsg_verses[(code, ch_num, v_num)] = lv["text"]

    assert len(web_verses) == 31095
    assert len(lsg_verses) == 31095
    assert set(web_verses.keys()) == set(lsg_verses.keys())
