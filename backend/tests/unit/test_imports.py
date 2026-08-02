import importlib
import inspect
import pkgutil
import typing
import pytest
import app

def test_all_app_modules_import_and_type_hints_evaluate():
    """
    Guard test for Batch 1 Item 1 & Round 2 R6:
    Verify all app modules import cleanly and all type annotations evaluate without NameError.
    """
    package = app
    for _, module_name, _ in pkgutil.walk_packages(package.__path__, package.__name__ + "."):
        mod = importlib.import_module(module_name)
        # Evaluate type hints for functions, classes, and methods defined in the app package
        for name, obj in inspect.getmembers(mod):
            if (inspect.isfunction(obj) or inspect.isclass(obj)) and obj.__module__.startswith("app"):
                try:
                    typing.get_type_hints(obj)
                except Exception as e:
                    pytest.fail(f"Failed evaluating type hints for {module_name}.{name}: {e}")
