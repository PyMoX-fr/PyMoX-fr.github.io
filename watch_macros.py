import time
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import subprocess
import os


class FileChangeHandler(FileSystemEventHandler):
    def on_modified(self, event):
        if (
            event.src_path.endswith("all_citations.py")
            or event.src_path.endswith("one_citation_a_day.py")
            or event.src_path.endswith("citations.json")
            # or event.src_path.startswith(os.path.abspath("./docs"))
        ):
            print("🔄 Modification détectée. Redémarrage de MkDocs...")
            os.system("taskkill /F /IM mkdocs.exe")
            subprocess.Popen(["mkdocs", "serve"])


handler = FileChangeHandler()
observer = Observer()
observer.schedule(handler, path="./macros_pymox", recursive=False)
# observer.schedule(handler, path="./", recursive=True)
observer.start()

print("👀 Surveillance du fichier...")
subprocess.Popen(["mkdocs", "serve"])

try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    observer.stop()

observer.join()
