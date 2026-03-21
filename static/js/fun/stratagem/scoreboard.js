// Small scoreboard page helper that returns to the game automatically after a short delay.
// DOM이 로드되었을 때 실행되는 초기화 함수
document.addEventListener('DOMContentLoaded', function() {
    // Scoreboard is intentionally transient, so return to the game page after a short pause.
    setTimeout(function() {
        location.replace(new URL("../", window.location.href).toString());
    }, 5000);
});
