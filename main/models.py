from django.db import models

class Tag(models.Model):
    tag = models.CharField("태그", max_length=128)

    def __str__(self):
        return self.tag

class Portfolio(models.Model):
    portfolio = models.CharField('제목', max_length=200)
    tags =  models.ManyToManyField(Tag, verbose_name="태그")
    content = models.TextField('내용')
    create_date = models.DateTimeField('날짜')
    def __str__(self):
        return self.portfolio


class Comment(models.Model):
    portfolio = models.ForeignKey(Portfolio, on_delete=models.CASCADE)
    content = models.TextField('내용')
    create_date = models.DateTimeField('날짜')
    def __str__(self):
        return self.portfolio
# Create your models here.
