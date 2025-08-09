import subprocess, re
from collections import defaultdict

# import markdown
# from pymdownx.blocks.details import Details

# md = markdown.Markdown(
#     extensions=["pymdownx.blocks.details"],
#     extension_configs={
#         "pymdownx.blocks.details": {
#             "types": [
#                 {
#                     "name": "unreleased-block",
#                     "class": "unreleased-block",
#                     "title": "My Default title",
#                 }
#             ]
#         }
#     },
# )


MAX_COMMITS = 177
CHANGELOG_PATH = "docs/outils/logs/CHANGELOG.md"
GITHUB_REPO_URL = "https://github.com/PyMoX-fr/PyMoX-fr.github.io/commit"


def get_git_log() -> list[str]:
    output = subprocess.check_output(
        [
            "git",
            "log",
            f"--max-count={MAX_COMMITS}",
            "--pretty=format:%h|%an|%ad|%s %d",
            "--date=format:%Y-%m-%d (%H:%M)",
        ]
    ).decode("utf-8")
    return output.splitlines()


def extract_tag(line: str) -> str | None:
    match = re.search(r"tag:\s*([^\),]+)", line)
    return match.group(1) if match else None


def group_commits_by_tag(commits: list[str]) -> dict[str, list[str]]:
    tag_commits = defaultdict(list)
    current_tag = "Unreleased"

    for commit in commits:
        tag = extract_tag(commit)
        if tag:
            current_tag = tag
        tag_commits[current_tag].append(commit)

    return tag_commits

def generate_base_labels() -> list[str]:
    distribution = [("success", 1), ("info", 8), ("note",999)]
    return [label for label, count in distribution for _ in range(count)]


def get_block_prefix_by_index(i: int, has_unreleased: bool) -> str:
    base_labels = generate_base_labels()

    if i >= len(base_labels):
        i = -1  # fallback à la fin

    prefix = "???+ " if i < 16 else "??? "  ## 18

    if has_unreleased:
        if i == 0:
            # return f"{prefix}<span id='unreleased_admonition'>warning</span>"  # Unreleased section
            return f"{prefix}unreleased-block"  # Unreleased section
        elif i == 1:
            return f"{prefix}success"  # First real version after unreleased

    return f"{prefix}{base_labels[i]}"


def format_changelog(tag_commits: dict[str, list[str]]) -> str:
    lines = ["# 📝 CHANGELOG</span>"]

    lines.append('???+ warning "<span style="color:red">ATTENTION : **Page en travaux**</span> 🚧"\n    <div class="copy_target" data-copy>→ Réfection du style du bloc si des commits de type Unreleased existent</div>')

    tags = list(tag_commits.keys())
    has_unreleased = tags[0] == "Unreleased"

    for i, (tag, commits) in enumerate(tag_commits.items()):
        block_prefix = get_block_prefix_by_index(i, has_unreleased)
        lines.append(f'{block_prefix} "📦 `{tag}`"\n')

        for commit in commits:
            parts = commit.split("|")
            if len(parts) >= 4:
                sha, author, date, message = parts[:4]
                if (
                    not (
                        message.startswith("Merge") and "PyMoX-fr.github.io" in message
                    )
                    and author != "semantic-release"
                ):
                    message = message.strip()
                    message = message[0].upper() + message[1:]
                    commit_url = f"{GITHUB_REPO_URL}/{sha}"
                    commit_line = (
                        f"    * {date} : [{message}]({commit_url}) (`{sha}`)"
                        if author == "GrCOTE7"
                        else f"    * {date} : [{message}]({commit_url}) by **{author}** (`{sha}`)"
                    )
                    lines.append(commit_line)
        lines.append("")

    return "\n".join(lines)


def update_changelog_file(content: str) -> None:
    with open(CHANGELOG_PATH, "w", encoding="utf-8") as f:
        f.write(content)


def showChangelog():
    commits = get_git_log()
    grouped = group_commits_by_tag(commits)
    content = format_changelog(grouped)
    update_changelog_file(content)


if __name__ == "__main__":
    showChangelog()
    print("✅ Changelog généré avec succès !")
    print("Ready.")
