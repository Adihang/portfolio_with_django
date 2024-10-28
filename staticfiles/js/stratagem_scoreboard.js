document.addEventListener('DOMContentLoaded', function() {
    var currentUrl = window.location.href;
    var protocolAndDomain = currentUrl.split('/').slice(0, 3).join('/');
    var baseUrl = protocolAndDomain + '/';
    console.log(baseUrl);
    setTimeout(function() {
        location.replace(baseUrl + "Stratagem_Hero/");
    }, 5000);
});