from crucible.core import settings


def test_settings_constant_can_be_monkeypatched(monkeypatch):
    monkeypatch.setattr(settings, "SOME_TEST_SETTING", "test-sentinel-value", raising=False)
    assert settings.SOME_TEST_SETTING == "test-sentinel-value"
