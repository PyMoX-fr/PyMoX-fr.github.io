from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import subprocess
import time

script_path = "./t/test_echo.sh"


class ScriptTrigger(FileSystemEventHandler):
    def on_modified(self, event):
        if event.src_path.endswith("test_echo.sh"):
            try:
                subprocess.run(["bash", script_path], check=True)
                print("✅ Script exécuté après modification")
            except subprocess.CalledProcessError as e:
                print("❌ Erreur :", e)


observer = Observer()
observer.schedule(ScriptTrigger(), path="./t", recursive=False)
observer.start()

try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    observer.stop()
observer.join()
