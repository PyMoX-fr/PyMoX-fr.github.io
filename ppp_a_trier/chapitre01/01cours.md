---
author: Votre nom
title: Chapitre 1 avec formules
tags:
  - mon tag 1
  - mon tag 2
---

## I. Paragraphe 1 : Quelques tips

!!! info "Mon info"

    Ma belle info qui doit être indentée
    

??? note "se déroule en cliquant dessus"

    Ma note indentée

??? tip "Astuce"

    Ma belle astuce indentée

### 1. Sous paragraphe 1

Texte 1.1

### 2. Sous paragraphe 2

Texte 1.2

## II. Paragraphe 2 : Quelques formules

Utiliser LaTeX

### 1. En maths

Une suite :

$$
\begin{cases}
u_0 = 1 \\
u_{n+1} = 0,75 u_n + 7 \quad \text{ pour }n \geqslant 0
\end{cases}  
$$

Ajouter ses commandes :

$$
\newcommand{\norm}[1]{\left\lVert#1\right\rVert}
\norm{\vec{v_C}} = \frac{\sqrt{(x_D - x_C)^2 + (y_D - y_C)^2}}{\Delta t}
$$

La norme du vecteur ${\vec{u}}$ se note $\norm{\vec{u}}$.

### 2. En chimie

$$
{CuSO_4}_{(s)}   \rightarrow   {Cu^{2+}}_{(aq)}+ {SO_{4}^{2-}}_{(aq)}
$$

$$
^{14}_{6}C  \rightarrow \ ^{14}_{7}N  + \  ^{ 0}_{-1}e^{-}
$$

On peut tout mettre en ligne : d'abord cette formule ${CuSO_4}_{(s)}   \rightarrow   {Cu^{2+}}_{(aq)}+ {SO_{4}^{2-}}_{(aq)}$
puis celle-ci :  $C^{14}_{6}  \rightarrow \ ^{14}_{7}N  + \  ^{ 0}_{-1}e^{-}$

Autre formule de chimie:

$$
\ce{Hg^2+ ->[I-] HgI2 ->[I-] [Hg^{II}I4]^2-}
$$

---

$$
E = m \times c^2 \\
$$

$$
\alpha, \beta, \gamma, \delta, \Delta, \epsilon, \eta, \theta, \lambda, \mu, \nu, \omega, \pi, \Pi, \rho, \sigma, \tau, \upsilon, \phi, \chi, \psi, \omega\\
\Gamma, \Lambda, \Sigma, \Upsilon, \Phi, \Psi, \Omega
\\
\mathbb{R}, \mathbb{Z}, \mathbb{N}\\
\infty\\
\int_a^b f(x) dx\\
\sum_{i=1}^n i\\
\lim_{x->+\infty}\frac{x}{x+1}=1\\
\prod_{k=1}^\infty k\\
$$
