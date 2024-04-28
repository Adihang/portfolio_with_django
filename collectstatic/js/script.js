document.addEventListener('DOMContentLoaded', function () {
    const imageElements = document.querySelectorAll('.hover-dark');

    imageElements.forEach(function (imageElement) {
        imageElement.style.transition = 'filter 0.5s ease';
        imageElement.addEventListener('mouseover', function () {
            imageElement.style.filter = 'brightness(0.5)';
        });

        imageElement.addEventListener('mouseout', function () {
            imageElement.style.filter = 'brightness(1)';
        });
    });
});
