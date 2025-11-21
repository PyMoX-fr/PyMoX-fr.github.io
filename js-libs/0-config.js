/*
pyodide-mkdocs-theme
Copyleft GNU GPLv3 🄯 2024 Frédéric Zinelli

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.
If not, see <https://www.gnu.org/licenses/>.
*/


/*
NOTE: Globals defined somewhere else:
    * The "ace" variable is defined in the ace library. Everything using it must be called after
      the libs insertion steps.
*/


const SqBs = {
    '[':'&lsqb;',
    ']':'&rsqb;',
    '&lsqb;': '[',
    '&rsqb;': ']',
    L: '&lsqb;',
    R: '&rsqb;',
}


const CONFIG = {

    /**Number of entries kept in validations history. */
    N_IDE_VALIDATIONS: 10,

    /* The following values are passed from python to JS through the main.html,
       once this script got loaded */
    //JS_CONFIG_DUMP
    argsFigureDivId: null,
    exportZipWithNames: null,
    exportZipPrefix: null,
    baseUrl: null,
    buttonIconsDirectory: null,
    editorFontFamily: null,
    editorFontSize: null,
    inServe: null,
    language: null,
    pmtUrl: null,
    pythonLibs: null,
    siteUrl: null,
    version: null,
    lang: {
        tests: null,
        comments: null,
        splitScreen: null,
        splitModePlaceholder: null,
        fullScreen: null,
        feedback: null,
        wrapTerm: null,
        runScript: null,
        installStart: null,
        installDone: null,
        refresh: null,
        validation: null,
        editorCode: null,
        publicTests: null,
        secretTests: null,
        successMsg: null,
        successMsgNoTests: null,
        unforgettable: null,
        delayedReveal: null,
        successHead: null,
        successHeadExtra: null,
        successTail: null,
        failHead: null,
        revealCorr: null,
        revealJoin: null,
        revealRem: null,
        failTail: null,
        titleCorr: null,
        titleRem: null,
        corr: null,
        rem: null,
        pyBtn: null,
        play: null,
        check: null,
        download: null,
        upload: null,
        restart: null,
        restartConfirm: null,
        save: null,
        zip: null,
        corrBtn: null,
        show: null,
        attemptsLeft: null,
        testsDone: null,
        testIdes: null,
        testStop: null,
        test1Ide: null,
        loadIde: null,
        qcmTitle: null,
        qcmMaskTip: null,
        qcmCheckTip: null,
        qcmRedoTip: null,
        tipTrash: null,
        figureAdmoTitle: null,
        figureText: null,
        p5Start: null,
        p5Stop: null,
        p5Step: null,
        pickerFailure: null,
        zipAskForNames: null
},
   //JS_CONFIG_DUMP

    // Temporary value updated for each IDE tested in the testing.test_ides page, to allow
    // automatic redirection for relative urls fetching:
    cutFeedback: null,
    relUrlRedirect : "",

    termMessage: null,      // (key, msg, format=null) -> undefined
    loadIdeContent: null,   // (editorId, name, code) -> undefined (used for ZIP imports)


    runningInfos: {
      action: null,         // Current running profile. Set through lockedRunnerWithBigFailWarningFactory.
      htmlId: null,         // html id of the current IDE, terminal or py_btn running.
      attemptsLeft: null,   // number of attempts left for the current IDE.
      errorMsg: "",         // First error message encountered in previous sections (updated once only, at the end of a section).
    },

    get running()       { return CONFIG.runningInfos.action },          // Backward compatibility
    get runningId()     { return CONFIG.runningInfos.htmlId },          // Backward compatibility
    get runningAttempt(){ return CONFIG.runningInfos.attemptsLeft },    // Backward compatibility


    /* Constants, to archive the  terminal, ace_editors, and all the PythonSectionRunner
     * objects at runtime :
     *   - Will be garbage collected on page change or reload.
     *   - Warning if navigation.instant gets restored !!
     * */
    terms:   {},            // debugging purpose
    editors: {},            // debugging purpose
    objs:    {},            // debugging purpose

    INFINITY: "∞",
    LZW: '\x1e',
    pyodideDelay: 100,
    ideKeyStrokesSave: 30,
    onDoneEvent: 'unload',

    // Various UI elements identifiers
    element: {
      allEditors:      'editor_ tester_ playground_'.split(' '),
      searchBlock:     "div.md-search",
      searchBtnsLeft:  "#search-btns-left",
      searchBtnsRight: "#search-btns-right",
      dayNight:        "form.md-header__option",
      stdoutCtrlId:    "#stdout-controller-btn",
      cutFeedbackSvg:  "#cut-feedback-svg",
      hourGlass:       "#header-hourglass-svg",
      qcm_admos:       ".py_mk_admonition_qcm",
      qcmCounterCls:   ".qcm-counter",
      qcmWrapper:      ".qcm_wrapper",
      testsResults:    "div.py_mk_tests_results",
      trashCan:        "#trash-can-svg",
      aceSettings:     'div#ace_settingsmenu',
      aceF1Cmds:       'div.ace_prompt_container',
      aceAutoComplete: 'ace_autocomplete',
      pmtTopDiv:       'pmt-top-div',
    },


    pyodideIsReady: false,
    classesPoolIsReady: false,
    overlordIsReady: false,
    overlordClasses: [],

    needMermaid: false,
    calledMermaid: false,


    // GENERATED:
    // All classes to use to create the various objects (mutated on the fly when needed):
    CLASSES_POOL: {
      GlobalRunnersManager: null,
      Ide: null,
      IdePlayground: null,
      IdeTester: null,
      PyBtn: null,
      Qcm: null,
      Question: null,
      Terminal: null
    },


    ZIP: {
      pySep: '#',
      tmpZipDir: 'tmp_zip_directory',
    },

    // Auto subscriber tracking:
    subscriptionReady: {},
    subscriptionsTries: {},

    loggerOptions: {},      // jsLogger debugging config/activations

    COMMENTED_PATTERN:  /(^\s*)(\S)(.?)/,
    MODULE_REG:         /File "<(env[^>]*|post[^>]*|exec|console)>", line (\d+)($|, in (?!redirect_cmd))/,
    TRACE_NUM_LINE:     / *File "([^"]+)", line (\d+)/,

    ESCAPE_SQ_B:        /\[|\]/g,
    UNESCAPE_SQ_B:      new RegExp(`${ SqBs.L }|${ SqBs.R }`, 'g'),

    ACE_COLOR_THEME: {
        customTheme: undefined,
        customThemeDefaultKey: "",
        aceStyle: undefined,
    },


    feedbackShortener: {
        // StdOut:
        msg: "&lsqb;Message truncated&rsqb;",
        limit: 1000,    // Cut if more than this
        head: 400,      // How many chars kept at the beginning
        tail: 200,      // How many chars kept at the end

        // Terminal stacktrace:
        traceLimit: 20,
        traceHead:  5,
        traceTail:  5,

        // Error message:
        errLimit: 15,
        errHead: 6,
        errTail: 5,
    },


    // Validation steps:
    section: {
        editor:  'editorCode',
        public:  'publicTests',
        secrets: 'secretTests',
    },
    sectionOrder: {
        editorCode:  1,
        publicTests: 2,
        secretTests: 3,
    },

    // GENERATED:
    PROFILES: {
      delayedReveal: "delayed_reveal",
      noReveal: "no_reveal",
      noValid: "no_valid",
      revealed: "revealed"
    },

    MSG: {
        successEmojis:   ['🔥','✨','🌠','✅','🥇','🎖'],

        promptStart:     ">>> ",
        promptWait:      "... ",
        leftSafeSqbr:    SqBs.L,
        rightSafeSqbr:   SqBs.R,
        exclusionMarker: "FORBIDDEN",
        bigFail:
            "\nIf You see this, there is a bug either in the website code, or in the way "
          + "this exercice is configured.\nPlease contact the webmaster with information "
          + "about what You were doing when this happened!\n\nDon't forget to check the "
          + "content of the console (F12) and possibly do a screenshot of any error message "
          + "there, to help debugging.",
    },

    QCM_SVG: `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg class="qcm" viewBox="0 0 12 12" role="img" version="1.1"
  xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg"
  style="stroke-width:1.25;stroke-linecap:round">
  <path class="bgd-svg" style="fill:var(--qcm-fill);stroke:none;" d="M 5.93,1.93 3.29,2.40 2.70,2.75 1.86,5.70 2.38,8.76 2.75,9.29 5.82,10.13 9.07,9.45 9.36,9.13 10.12,6.11 9.49,2.93 9.12,2.65 Z"></path>
  <g style="fill:var(--qcm-light);stroke:var(--qcm-light)">
    <path class="tick" style="display:var(--tick);stroke-width:0;stroke-linecap:butt;stroke-linejoin:round" d="M 6.34,8.49 C 6.49,7.32 7.07,5.36 9.05,4.06 L 8.93,3.91 C 7.13,4.50 6.38,5.52 5.63,7.03 5.36,6.61 3.91,5.92 3.47,5.86 L 3.32,6.00 C 4.41,6.54 5.06,7.30 5.63,8.77"></path>
    <g style="display:var(--cross);" transform="matrix(0.91,0,0,0.91,0.52,0.52)">
      <rect width="8.33" height="0.59" x="-5.86" y="8.02" transform="rotate(-56.54)"></rect>
      <rect width="8.33" height="0.59" x="-12.47" y="-1.99" transform="matrix(-0.55,-0.83,-0.83,0.55,0,0)"></rect>
    </g>
  </g>
  <g style="fill:none;stroke:var(--qcm-border)">
    <circle style="display:var(--circle)" cy="6" cx="6" r="4.2"></circle>
    <rect style="display:var(--square)" class="square" width="7.41" height="7.36" x="2.29" y="2.32"></rect>
  </g>
</svg>`,

  qcm: {
    checked:   "checked",
    unchecked: "unchecked",
    ok:        'correct',
    wrong:     'incorrect',
    missed:    'missed',
    multi:     'multi',
    single:    'single',
    failOk:    'must-fail',
    failTest:  'fail-test',
    passBad:   'pass-bad',
  },
  qcm_clean_up: [
    'checked', 'unchecked', 'correct', 'incorrect', 'must-fail', 'fail-test', 'pass-bad'
  ],
}
