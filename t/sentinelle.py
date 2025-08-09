#!/usr/bin/env python3
import os
import re
import requests
from importlib.metadata import version, PackageNotFoundError
from ruamel.yaml import YAML

rapport_lines = []

def log(msg, markdown=False):
    print(msg)
    if markdown:
        rapport_lines.append(msg)

# =========================
# 1. Chargement du fichier mkdocs.yml
# =========================
def load_mkdocs_config(path="mkdocs.yml"):
    yaml = YAML(typ="safe")
    try:
        with open(path, "r", encoding="utf-8") as f:
            return yaml.load(f)
    except Exception as e:
        log(f"⚠️ Impossible d'analyser complètement {path} : {e}", markdown=True)
        log("ℹ️ Certaines extensions ou tags YAML personnalisés peuvent ne pas être pris en charge.\n", markdown=True)
        return {}

# =========================
# 2. Extraction des chemins de navigation
# =========================
def extract_paths(nav_list):
    paths = []
    for item in nav_list:
        if isinstance(item, dict):
            for _, value in item.items():
                if isinstance(value, list):
                    paths.extend(extract_paths(value))
                elif isinstance(value, str):
                    paths.append(value)
        elif isinstance(item, str):
            paths.append(item)
    return paths

def check_nav_files(config):
    nav_paths = extract_paths(config.get("nav", []))
    missing = [p for p in nav_paths if not os.path.exists(os.path.join("docs", p))]
    if missing:
        log("❌ Fichiers manquants référencés dans nav:", markdown=True)
        for f in missing:
            log(f"  - {f}", markdown=True)
    else:
        log("✅ Tous les fichiers référencés existent.\n", markdown=True)

# =========================
# 3. Vérification des liens externes
# =========================
def check_external_links():
    md_files = [
        os.path.join(root, file)
        for root, _, files in os.walk("docs")
        for file in files if file.endswith(".md")
    ]

    link_pattern = re.compile(r"\[.+?\]\((http[s]?://[^\)]+)\)")
    broken_links = []

    for md_file in md_files:
        with open(md_file, "r", encoding="utf-8") as f:
            content = f.read()
        for url in link_pattern.findall(content):
            try:
                resp = requests.head(url, allow_redirects=True, timeout=5)
                if resp.status_code >= 400:
                    broken_links.append((md_file, url))
            except Exception:
                broken_links.append((md_file, url))

    if broken_links:
        log("\n❌ Liens externes cassés:", markdown=True)
        for file, link in broken_links:
            log(f"  - {link} (dans {file})", markdown=True)
    else:
        log("\n✅ Tous les liens externes semblent valides.\n", markdown=True)

# =========================
# 4. Vérification des versions de packages
# =========================
def get_latest_version(package):
    url = f"https://pypi.org/pypi/{package}/json"
    try:
        data = requests.get(url, timeout=5).json()
        return data["info"]["version"]
    except:
        return None

def check_package_versions(packages):
    log("📦 Vérification des versions :", markdown=True)
    for package in packages:
        try:
            installed = version(package)
            latest = get_latest_version(package)
            if latest and installed != latest:
                log(f"  ⚠ {package} : installé {installed}, dernière version {latest}", markdown=True)
            else:
                log(f"  ✅ {package} : à jour ({installed})", markdown=True)
        except PackageNotFoundError:
            log(f"  ❌ {package} : non installé", markdown=True)

# =========================
# 5. Génération du rapport Markdown
# =========================
def generate_markdown_report(path="t/rapport.md"):
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write("# 📋 Rapport de vérification MkDocs\n\n")
            f.write("\n".join(rapport_lines))
        log(f"\n📝 Rapport généré : {path}")
    except Exception as e:
        log(f"❌ Impossible d'écrire le rapport : {e}")

# =========================
# 6. Exécution principale
# =========================
if __name__ == "__main__":
    config = load_mkdocs_config()
    check_nav_files(config)
    check_external_links()
    check_package_versions(["mkdocs", "mkdocs-material", "pyodide-mkdocs-theme"])
    generate_markdown_report()
