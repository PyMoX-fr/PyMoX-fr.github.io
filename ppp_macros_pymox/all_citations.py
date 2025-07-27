import json
from datetime import datetime


def define_env(env):
    @env.macro
    def all_citations():
        with open("ppp_macros_pymox/citations.json", encoding="utf-8") as f:
            data = json.load(f)
        citations = data["citations"]


        str=''
        for i in range(len(citations)):

            citation_obj = citations[i]
            texte = citation_obj.get("texte", "Citation manquante")
            contexte = citation_obj.get("contexte", "Citation célèbre")
            auteur = citation_obj.get("auteur", "Auteur inconnu")

            str += f"""<div>{i}</div><blockquote><i>"{texte}"</i><footer>{contexte} < {auteur}</footer></blockquote><hr>"""
        return str
