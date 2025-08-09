# Coder ici avec une CLI pour sh t/hotreload.py
# Et une autre pour mkdocs serve --dev-addr=0.0.0.0:8000
# ( Si besoin d'un autre port: mkdocs serve --dev-addr=0.0.0.0:8000 )

VIEW_PATH = "docs/outils/essais/essai.md"


def retour_link():
    retour = '<a href="../sommaire" style="text-decoration: none; font-weight: bold;">Retour Sommaire</a>'
    avertissement = "<i>Page générée par <b>./main.py</b>.</i>"

    # texte = f"<div style='display: flex; justify-content: space-between'><span>"+retour+f"</span><span>{avertissement}</span></div>"
    texte = (
        "<div style='display: flex; justify-content: space-between; "
        "align-items: center; width: 100%; line-hight: .7em; padding-top: 0;padding-bottom: 0;'>"
        f"<span>{retour}</span>"
        f"<span>{avertissement}</span>"
        "</div>"
    )
    return texte


def exemple():
    return """
```python
import os
os.system("mkdocs serve")
```
"""


def show(content: str) -> None:
    with open(VIEW_PATH, "w", encoding="utf-8") as f:

        sommaire_link = retour_link()
        content = sommaire_link + "<hr>" + content + "<hr>" + sommaire_link
        f.write(content)


if __name__ == "__main__":

    content = "Ready."

    content = exemple()

    content = f"<p>{content}</p>"
    show(content)
    print(content)
