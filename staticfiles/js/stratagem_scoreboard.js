document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
        location.replace(new URL("../", window.location.href).toString());
    }, 5000);
});
