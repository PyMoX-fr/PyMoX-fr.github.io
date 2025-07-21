# Modified version of Brython's SVG module
# Author: Romain Casati
# License: GPL v3 or higher

from __future__ import annotations

_svg_ns = "http://www.w3.org/2000/svg"
_xlink_ns = "http://www.w3.org/1999/xlink"

_svg_tags = [
    "a",
    "altGlyph",
    "altGlyphDef",
    "altGlyphItem",
    "animate",
    "animateColor",
    "animateMotion",
    "animateTransform",
    "circle",
    "clipPath",
    "color_profile",  # instead of color-profile
    "cursor",
    "defs",
    "desc",
    "ellipse",
    "feBlend",
    "foreignObject",  # patch to enable foreign objects
    "g",
    "image",
    "line",
    "linearGradient",
    "marker",
    "mask",
    "path",
    "pattern",
    "polygon",
    "polyline",
    "radialGradient",
    "rect",
    "set",
    "stop",
    "svg",
    "text",
    "tref",
    "tspan",
    "use",
]


class Element:
    def __init__(self, tag: str, ns=None, value=None):
        self._tag = tag
        self._value = value
        self._ns = ns
        self._attributes: dict[str, str] = {}
        self._children: list[Element] = []
        # this is mandatory to display svg properly
        if tag == "svg" and ns is not None:
            self.setAttribute("xmlns", ns)

    def setAttribute(self, attribute: str, value: str):
        self.setAttributeNS(None, attribute, value)

    def setAttributeNS(self, ns: str | None, attribute: str, value: str):
        key = attribute
        if ns is not None:
            key = f"{ns}:{key}"
        self._attributes[key] = value

    def appendChild(self, child: Element):
        self._children.append(child)

    def removeChild(self, other: Element):
        self._children.remove(other)

    def addEventListener(self, event, callback):
        pass

    def render_attributes(self) -> str:
        # remove .0 part for int
        def filter(x):
            if isinstance(x, float) and int(x) == x:
                x = int(x)
            return x

        return " ".join(f'{k}="{filter(v)}"' for k, v in self._attributes.items())

    def __str__(self) -> str:
        open_tag = f"<{self._tag} {self.render_attributes()}>"
        close_tag = f"</{self._tag}>"
        content = "".join(str(e) for e in self._children)
        if self._value is not None:
            content += self._value
        return f"{open_tag}{content}{close_tag}"

    def reduire_animation(self):
        if "dur" in self._attributes:  # On réduit le temps de l'animation
            self._attributes["dur"] = " 1ms"
        for elem in self._children:
            elem.reduire_animation()


def _tag_func(tag):
    def func(*args, **kwargs):
        node = Element(tag, ns=_svg_ns)
        for arg in args:
            if isinstance(arg, (str, int, float)):
                arg = Element("text", value=str(arg))
            node.appendChild(arg)
        for key, value in kwargs.items():
            key = key.lower()
            if key[0:2] == "on":
                # Event binding passed as argument "onclick", "onfocus"...
                # Better use method bind of DOMNode objects
                node.addEventListener(key[2:], value)
            elif key == "style":
                node.setAttribute(
                    "style", ";".join(f"{k}: {v}" for k, v in value.items())
                )
            elif "href" in key:
                node.setAttributeNS(_xlink_ns, "href", value)
            elif value is not False:
                # option.selected=false sets it to true :-)
                node.setAttributeNS(None, key.replace("_", "-"), value)
        return node

    return func


for tag in _svg_tags:
    vars()[tag] = _tag_func(tag)
