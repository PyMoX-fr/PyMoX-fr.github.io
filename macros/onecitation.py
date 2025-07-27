import json
from datetime import datetime


def define_env(env):
    @env.macro
    def citation_random():
        with open("docs/xtra/macros/citations.json", encoding="utf-8") as f:
            data = json.load(f)

        citations = data["citations"]
        # On utilise la date du jour comme point de départ
        index = datetime.now().timetuple().tm_yday % len(citations)
        citation_obj = citations[index]
        texte = citation_obj.get("texte", "Citation manquante")
        auteur = citation_obj.get("auteur", "Auteur inconnu")
        return (
            f"""<blockquote><i>"{texte}"</i><footer>— {auteur}</footer></blockquote>"""
        )

    @env.macro
    def macros_info():
        return "✅ Le plugin macros fonctionne bien !"
