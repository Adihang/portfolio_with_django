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
        
    def get_absolute_url(self):
        return f'/project/{self.id}/'


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
        
class Hobby(models.Model):
    order = OrderField()
    title = models.CharField('제목', max_length=200)
    banner_img = models.ImageField("대표 이미지", upload_to=upload_to_project)
    content = models.TextField('내용')
    class Meta:
        ordering = ['order']
        
class Stratagem_Class(models.Model):
    gem_class = models.CharField("스트라타잼 분류", max_length=128)

    def __str__(self):
        return self.gem_class
    
def upload_stratagem(instace: "Project", filename: str) -> str:
    return make_new_path(
        path_ext=filename,
        dirname=f"uploads/contents/stratagem",
        new_filename=str(uuid.uuid4().hex),
    )
    
class Stratagem(models.Model):
    order = OrderField()
    name = models.CharField('이름', max_length=200)
    icon = models.FileField("아이콘", upload_to=upload_stratagem)
    stratagem_class =  models.ManyToManyField(Stratagem_Class, verbose_name="스트라타잼 분류")
    command = models.IntegerField('Command')
    class Meta:
        ordering = ['order']
        
class Stratagem_Hero_Score(models.Model):
    name = models.CharField('이름', max_length=128)
    score = models.FloatField('점수')
    class Meta:
        ordering = ['score']
        
    def save(self, *args, **kwargs):
        if not self.pk:  # 객체가 아직 데이터베이스에 저장되지 않았을 경우
            existing_score = Stratagem_Hero_Score.objects.filter(name=self.name).first()
            if existing_score:
                # name이 같은 기존 객체가 있다면 점수만 업데이트합니다.
                existing_score.score = self.score
                return existing_score.save(*args, **kwargs)
        super(Stratagem_Hero_Score, self).save(*args, **kwargs)
        
        
def upload_Disciple_icon(instace: "Project", filename: str) -> str:
    return make_new_path(
        path_ext=filename,
        dirname=f"uploads/contents/disciple_icon",
        new_filename=str(uuid.uuid4().hex),
    )
    
class Disciple_icon(models.Model):
    name = models.CharField('이름', max_length=200)
    icon = models.FileField("아이콘", upload_to=upload_Disciple_icon)
    name = models.CharField('오답', max_length=200)
