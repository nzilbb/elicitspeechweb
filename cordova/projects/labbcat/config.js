// app-specific configuration to work with LaBB-CAT and browser-based elicitation
var config = {
    url : window.location.origin + window.location.pathname.replace(/index\.html/, "steps"),
    tasks : [ window.location.search.replace(/^\?.*task=/,"") ]
};
