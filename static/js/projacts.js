document.querySelectorAll('.hover-image').forEach(function(image) {
    image.addEventListener('mouseenter', function() {
        this.style.filter = 'blur(8px)';
        this.closest('.project_card').querySelector('.overlay').style.opacity = 1;
    });

    image.addEventListener('mouseleave', function() {
        this.style.filter = 'blur(0)';
        this.closest('.project_card').querySelector('.overlay').style.opacity = 0;
    });

    image.addEventListener('click', function() {
        console.log('Image clicked!'); // Add this line to log a message to the console
    });
});