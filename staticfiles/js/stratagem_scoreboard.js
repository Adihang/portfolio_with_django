// DOM이 로드되었을 때 실행되는 초기화 함수
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
        location.replace(new URL("../", window.location.href).toString());
    }, 5000);
});
