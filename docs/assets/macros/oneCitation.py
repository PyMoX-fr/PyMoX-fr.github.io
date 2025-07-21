import json
import random


def define_env(env):
    @env.macro
    def citation_random():
        with open("docs/assets/divers/citations.json", encoding="utf-8") as f:
            data = json.load(f)
        return random.choice(data["citations_audiard"])
    def macros_info():
        return "Macros plugin is working!"

