function mathJaxUpdate(){
    jsLogger('[MathJax] - Page formatting')
  
    if(!window.MathJax.startup.output){
      console.error("Cannot update MathJax (CDN failed to load?)")
      return
    }
  
    window.MathJax.startup.output.clearCache()
    window.MathJax.typesetClear()
    window.MathJax.texReset()
    window.MathJax.typesetPromise()
  }
  const mathJaxIsReady = subscribeWhenReady('mathJax', mathJaxUpdate, {maxTries:100})
  
  
  window.MathJax = {
    startup: {
      ready: () => {
        jsLogger("[MathJax] - Setting up");
        MathJax.startup.defaultReady();
        jsLogger("[MathJax] - Ready");
        mathJaxIsReady()
        mathJaxUpdate()
      },
    },
    loader: {
      load: ['[tex]/cancel', 'output/svg', '[tex]/color', '[tex]/mhchem']
    },
    tex: {
      packages: {'[+]': ['cancel', 'color', 'mhchem']},
      inlineMath: [["\\(", "\\)"]],
      displayMath: [["\\[", "\\]"]],
      processEscapes: true,
      processEnvironments: true,
    },
    options: {
      ignoreHtmlClass: ".*|",
      processHtmlClass: "arithmatex",
    },
  }