---
title: 🧸 Bac à sable
---

Quatre éditeurs dans lesquels faire des essais ...

=== "Bac à sable basique pour Python"

    {{ IDE(MIN_SIZE=15) }}


=== "Bac à sable pour utiliser turtle"

    ??? tip "Rappels sur la :turtle:"

        On rappelle ci-dessous les instructions utiles du module [`turtle`](https://docs.python.org/3/library/turtle.html){:target="_blank" }.
        
        <center>
        
        | Appel           | Rôle                                                                                                      |
        | :-------------- | :-------------------------------------------------------------------------------------------------------- |
        | `hideturtle()`  | Cache la tortue.                                                                                          |
        | `speed(n)`      | Définit la vitesse de l'animation.<br>`n` est un entier entre `#!py 1` (lent) et `#!py 10` (rapide).<br> Si `n` est égal à `#!py 0` la figure s'affiche instantanément                                                                        |
        | `animation(s)`  | Autorise ou non les animations.<br>`s` est soit `#!py 'on'` (avec animations, valeur par défaut)<br> soit `#!py 'off'` (sans animations).      |
        | `penup()` ou `up()`| Lève le crayon : les déplacements de la tortue ne sont plus dessinés.                                    |
        | `pendown()` ou `down()` | Baisse le crayon : les déplacements de la tortue sont dessinés.                                     |
        | `heading()`     | Renvoie la direction vers laquelle pointe la tortue sous la forme d'une mesure d'angle en degrés.         |
        | `setheading(d)` | Définit la direction vers laquelle pointe la tortue.<br>`#!py d` est une mesure d'angle en degrés.        |
        | `position()`    | Renvoie la position de la tortue sous la forme d'un couple de nombres `#!py (x, y)`.                      |
        | `goto(x, y)`    | La tortue se déplace à la position `#!py (x, y)`.<br>`#!py x` et `#!py y` sont des nombres.               |
        | `left(a)`       | La tortue tourne sur elle-même vers la gauche de `#!py a` degrés.<br>`#!py a` est un nombre.              |
        | `right(a)`      | La tortue tourne sur elle-même vers la droite de `#!py a` degrés.<br>`#!py a` est un nombre.              |
        | `forward(p)`    | La tortue avance de `#!py p` pixels.<br>`#!py p` est un nombre.                                           |
        | `color("black")`| La couleur utilisée sera le noir                                                                          |  
        | `begin_fill()`  | Commence le remplissage avec une couleur                                                                  |  
        | `end_fill()`    | Termine le remplissage avec une couleur                                                                   |  
        
        </center>

    {{ IDE('py_sandbox/tortue_sandbox', MIN_SIZE=15) }}

    {{ figure(admo_title="Figure avec le module turtle") }}

    :race_car: il est possible d'augmenter la vitesse jusqu'à `#!py speed(100)` ! :race_car:

=== "Bac à sable pour des calculs formels avec sympy"

    ??? note "Comment utiliser sympy pour des calculs formels"

        Commencer par exécuter le code. Vous pourrez écrire vos calculs dans la partie console (en dessous de l'éditeur, à côté de `>>>`).

        Par exemple : 

        ![developper](sympy/images/developper.jpg){ width=60% }

        Vous pouvez aussi définir des fonctions dans la partie éditeurs, exécuter le code, et ensuite utiliser la console : 

        ![avec fonction](sympy/images/avec_fct.jpg){ width=60% }   

    {{ IDE('sympy/scripts/sympy_vide', ID=2, MIN_SIZE=6) }}

=== "Bac à sable pour des tracés avec sympy"

    {{ IDE('sympy/scripts/graphe_bac_sable') }}
    {{ figure('bac_sable') }}

_Crédits pour le bac à sable avec la tortue : Romain Janvier et Frédéric Zinelli_  
_Crédits pour l'intégration de la bibliothèque sympy : Frédéric Zinelli_
