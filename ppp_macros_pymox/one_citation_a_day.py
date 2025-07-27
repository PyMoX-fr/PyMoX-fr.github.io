# from pyodide_mkdocs_theme.pyodide_macros import PyodideMacrosPlugin

import json
from datetime import datetime


def define_env(env):
    @env.macro
    def one_citation_a_day(n=0):
        with open("ppp_macros_pymox/citations.json", encoding="utf-8") as f:
            data = json.load(f)

        citations = data["citations"]
        # On utilise la date du jour comme point de départ
        index = datetime.now().timetuple().tm_yday % len(citations)
        index = n or 12
        citation_obj = citations[index]
        texte = citation_obj.get("texte", "Citation manquante")
        contexte = citation_obj.get("contexte", "Citation célèbre")
        auteur = citation_obj.get("auteur", "Auteur inconnu")
        return f"""<blockquote><i>"{texte}"</i><footer>{contexte} < {auteur}</footer></blockquote>"""
