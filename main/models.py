from django.db import models
from config.utils import make_new_path
import uuid

class Project_Tag(models.Model):
    tag = models.CharField("태그", max_length=128)

    def __str__(self):
        return self.tag

def upload_to_project(instace: "Project", filename: str) -> str:
    return make_new_path(
        path_ext=filename,
        dirname=f"uploads/contents/project",
        new_filename=str(uuid.uuid4().hex),
    )

class OrderField(models.PositiveIntegerField):
    def __init__(self, *args, **kwargs):
        kwargs['blank'] = True
        kwargs['null'] = True
        super().__init__(*args, **kwargs)
        
class Project(models.Model):
    order = OrderField()
    title = models.CharField('제목', max_length=200)
    banner_img = models.ImageField("대표 이미지", upload_to=upload_to_project)
    tags =  models.ManyToManyField(Project_Tag, verbose_name="태그")
    content = models.TextField('내용')
    create_date = models.DateField('날짜')
    class Meta:
        ordering = ['order']


class Project_Comment(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    content = models.TextField('내용')
    create_date = models.DateTimeField('날짜')
    
class Career(models.Model):
    order = OrderField()
    company = models.CharField('회사', max_length=128)
    position = models.CharField("직책", max_length=128)
    content = models.TextField('업무')
    period = models.CharField("기간", max_length=128, default="1년")
    join_date = models.DateField('입사일')
    leave_date = models.DateField('퇴사일')
    class Meta:
        ordering = ['order']
