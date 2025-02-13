// app-specific configuration to work with LaBB-CAT and browser-based elicitation
var urlParameters = new URLSearchParams(window.location.search);
var config = {
  url : window.location.origin + window.location.pathname.replace(/index\.html/, "steps"),
  tasks : [ urlParameters.get("task") ],
  participantId : urlParameters.get("participant") || urlParameters.get("workerId")
};
