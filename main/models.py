from django.conf import settings
from django.contrib.auth.models import Group
from django.db import models
from django.utils import timezone
from config.utils import make_new_path
import uuid
import calendar

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
    title_en = models.CharField("영문 제목", max_length=200, blank=True, default="")
    banner_img = models.ImageField("대표 이미지", upload_to=upload_to_project)
    tags =  models.ManyToManyField(Project_Tag, verbose_name="태그")
    content = models.TextField('내용')
    content_en = models.TextField("영문 내용", blank=True, default="")
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
    company_en = models.CharField("영문 회사", max_length=128, blank=True, default="")
    position = models.CharField("직책", max_length=128)
    content = models.TextField('업무')
    content_en = models.TextField("영문 업무", blank=True, default="")
    join_date = models.DateField('입사일')
    leave_date = models.DateField('퇴사일', blank=True, null=True, help_text="재직 중이면 비워두세요.")
    class Meta:
        ordering = ['order']

    @property
    def is_currently_employed(self):
        return self.leave_date is None

    @property
    def effective_leave_date(self):
        return timezone.localdate() if self.is_currently_employed else self.leave_date

    @staticmethod
    def _calculate_date_delta(start_date, end_date):
        if not start_date or not end_date or end_date < start_date:
            return 0, 0, 0

        years = end_date.year - start_date.year
        months = end_date.month - start_date.month
        days = end_date.day - start_date.day

        if days < 0:
            months -= 1
            prev_month = 12 if end_date.month == 1 else end_date.month - 1
            prev_year = end_date.year - 1 if end_date.month == 1 else end_date.year
            days += calendar.monthrange(prev_year, prev_month)[1]

        if months < 0:
            years -= 1
            months += 12

        return max(years, 0), max(months, 0), max(days, 0)

    @classmethod
    def _format_period_ko(cls, start_date, end_date):
        years, months, days = cls._calculate_date_delta(start_date, end_date)
        parts = []
        if years:
            parts.append(f"{years}년")
        if months:
            parts.append(f"{months}개월")
        if days or not parts:
            parts.append(f"{days}일")
        return " ".join(parts)

    @classmethod
    def _format_period_en(cls, start_date, end_date):
        years, months, days = cls._calculate_date_delta(start_date, end_date)
        parts = []
        if years:
            parts.append(f"{years}y")
        if months:
            parts.append(f"{months}m")
        if days or not parts:
            parts.append(f"{days}d")
        return " ".join(parts)

    @property
    def display_period(self):
        return self._format_period_ko(self.join_date, self.effective_leave_date)

    @property
    def display_period_en(self):
        return self._format_period_en(self.join_date, self.effective_leave_date)

    @classmethod
    def _calculate_rounded_month_period(cls, start_date, end_date):
        years, months, days = cls._calculate_date_delta(start_date, end_date)
        if days >= 15:
            months += 1

        if months >= 12:
            years += months // 12
            months = months % 12

        return years, months

    @property
    def display_period_rounded(self):
        years, months = self._calculate_rounded_month_period(self.join_date, self.effective_leave_date)
        parts = []
        if years:
            parts.append(f"{years}년")
        if months:
            parts.append(f"{months}개월")
        if not parts:
            return "0개월"
        return " ".join(parts)

    @property
    def display_period_en_rounded(self):
        years, months = self._calculate_rounded_month_period(self.join_date, self.effective_leave_date)
        parts = []
        if years:
            parts.append(f"{years} year")
        if months:
            parts.append(f"{months} month")
        if not parts:
            return "0 month"
        return " ".join(parts)

    @staticmethod
    def _format_korean_date(value):
        if not value:
            return ""
        return f"{value.year}년 {value.month}월 {value.day}일"

    @property
    def formatted_join_date(self):
        return self._format_korean_date(self.join_date)

    @property
    def formatted_leave_date(self):
        return self._format_korean_date(self.effective_leave_date)

    @property
    def formatted_date_range(self):
        return f"{self.formatted_join_date} ~ {self.formatted_leave_date}"
        
class Hobby(models.Model):
    order = OrderField()
    title = models.CharField('제목', max_length=200)
    banner_img = models.ImageField("대표 이미지", upload_to=upload_to_project)
    content = models.TextField('내용')
    class Meta:
        ordering = ['order']


class NavLink(models.Model):
    order = models.IntegerField("순서", default=0)
    name = models.CharField("표시이름", max_length=100)
    url = models.CharField("이동 경로", max_length=500)

    class Meta:
        ordering = ["order", "id"]
        permissions = [
            ("can_edit_docs", "Can edit HanDrive content"),
        ]

    def __str__(self):
        return f"{self.order}. {self.name}"


class DocsAccessRule(models.Model):
    path = models.CharField(
        "경로",
        max_length=1024,
        unique=True,
        blank=True,
        default="",
        help_text="/handrive 기준 상대 경로. 비우면 /handrive 루트",
    )
    read_users = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        verbose_name="읽기 허용 사용자",
        blank=True,
        related_name="docs_read_access_rules",
    )
    read_groups = models.ManyToManyField(
        Group,
        verbose_name="읽기 허용 그룹",
        blank=True,
        related_name="docs_read_access_rules",
    )
    write_users = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        verbose_name="쓰기 허용 사용자",
        blank=True,
        related_name="docs_write_access_rules",
    )
    write_groups = models.ManyToManyField(
        Group,
        verbose_name="쓰기 허용 그룹",
        blank=True,
        related_name="docs_write_access_rules",
    )
    created_at = models.DateTimeField("생성일", auto_now_add=True)
    updated_at = models.DateTimeField("수정일", auto_now=True)

    class Meta:
        ordering = ["path"]
        verbose_name = "문서 접근 규칙"
        verbose_name_plural = "문서 접근 규칙"

    def __str__(self):
        return self.path or "/handrive"


class DocsSharedLink(models.Model):
    path = models.CharField(
        "문서 경로",
        max_length=1024,
        unique=True,
        help_text="/handrive 기준 상대 파일 경로",
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="docs_shared_links",
        verbose_name="공유 생성 사용자",
    )
    share_slug = models.CharField("공유 슬러그", max_length=255)
    created_at = models.DateTimeField("생성일", auto_now_add=True)
    updated_at = models.DateTimeField("수정일", auto_now=True)

    class Meta:
        ordering = ["owner__username", "share_slug"]
        verbose_name = "문서 공유 링크"
        verbose_name_plural = "문서 공유 링크"
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "share_slug"],
                name="unique_docs_shared_link_owner_slug",
            )
        ]

    def __str__(self):
        return f"{self.owner.username}/{self.share_slug}"


class DocsLoginAttemptGuard(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="docs_login_attempt_guard",
        verbose_name="사용자",
    )
    failed_attempts = models.PositiveIntegerField("연속 로그인 실패 횟수", default=0)
    captcha_required = models.BooleanField("캡챠 필요 여부", default=False)
    updated_at = models.DateTimeField("수정일", auto_now=True)

    class Meta:
        verbose_name = "Docs 로그인 보호 상태"
        verbose_name_plural = "Docs 로그인 보호 상태"


class QuickLink(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="quick_links",
        verbose_name="사용자",
    )
    name = models.CharField("이름", max_length=80)
    url = models.URLField("URL", max_length=500)
    icon_url = models.URLField("아이콘 URL", max_length=500, blank=True, default="")
    display_order = models.PositiveIntegerField("표시 순서", default=0)
    created_at = models.DateTimeField("생성일", auto_now_add=True)
    updated_at = models.DateTimeField("수정일", auto_now=True)

    class Meta:
        ordering = ["display_order", "id"]
        verbose_name = "루트 바로가기"
        verbose_name_plural = "루트 바로가기"

    def __str__(self):
        return f"{self.user}: {self.name}"

    def __str__(self):
        return f"{self.user} ({self.failed_attempts})"


class UserProfile(models.Model):
    THEME_LIGHT = "light"
    THEME_DARK = "dark"
    THEME_MODE_CHOICES = [
        (THEME_LIGHT, "라이트"),
        (THEME_DARK, "다크"),
    ]
    UI_LANG_CHOICES = [
        ("ko", "한국어"),
        ("en", "English"),
    ]
    ROOT_SEARCH_ENGINE_CHOICES = [
        ("google", "Google"),
        ("youtube", "YouTube"),
        ("duckduckgo", "DuckDuckGo"),
        ("bing", "Bing"),
        ("naver", "Naver"),
        ("gpt", "GPT"),
        ("claude", "Claude"),
        ("gemini", "Gemini"),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
        verbose_name="사용자",
    )
    theme_mode = models.CharField(
        "테마 모드",
        max_length=5,
        choices=THEME_MODE_CHOICES,
        blank=True,
        default="",
    )
    preferred_ui_lang = models.CharField(
        "선호 언어",
        max_length=2,
        choices=UI_LANG_CHOICES,
        blank=True,
        default="",
    )
    preferred_root_search_engine = models.CharField(
        "루트 검색 엔진",
        max_length=12,
        choices=ROOT_SEARCH_ENGINE_CHOICES,
        blank=True,
        default="",
    )
    bumpercar_spiky_stats = models.JSONField(
        "범퍼카 스핔이 전적",
        default=dict,
        blank=True,
    )
    privacy_policy_agreed_at = models.DateTimeField(
        "개인정보 처리방침 동의 시각",
        null=True,
        blank=True,
    )
    terms_of_service_agreed_at = models.DateTimeField(
        "이용약관 동의 시각",
        null=True,
        blank=True,
    )
    updated_at = models.DateTimeField("수정일", auto_now=True)

    class Meta:
        verbose_name = "사용자 프로필"
        verbose_name_plural = "사용자 프로필"

    def __str__(self):
        mode = self.theme_mode or "auto"
        return f"{self.user} ({mode})"


def upload_to_portfolio_profile(instance: "PortfolioProfile", filename: str) -> str:
    return make_new_path(
        path_ext=filename,
        dirname="uploads/contents/portfolio/profile",
        new_filename=str(uuid.uuid4().hex),
    )


def upload_to_portfolio_project(instance: "PortfolioProject", filename: str) -> str:
    return make_new_path(
        path_ext=filename,
        dirname="uploads/contents/portfolio/project",
        new_filename=str(uuid.uuid4().hex),
    )


class PortfolioProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="portfolio_profile",
        verbose_name="사용자",
    )
    profile_img = models.ImageField("프로필 사진", upload_to=upload_to_portfolio_profile, blank=True, null=True)
    main_title = models.CharField("메인 타이틀", max_length=255, blank=True, default="")
    main_title_en = models.CharField("영문 메인 타이틀", max_length=255, blank=True, default="")
    phone = models.CharField("휴대폰번호", max_length=50, blank=True, default="")
    email = models.EmailField("이메일", blank=True, default="")
    main_subtitle = models.TextField("메인 소개", blank=True, default="")
    main_subtitle_en = models.TextField("영문 메인 소개", blank=True, default="")
    created_at = models.DateTimeField("생성일", auto_now_add=True)
    updated_at = models.DateTimeField("수정일", auto_now=True)

    class Meta:
        verbose_name = "포트폴리오 프로필"
        verbose_name_plural = "포트폴리오 프로필"

    def __str__(self):
        return f"{self.user} 포트폴리오"


class PortfolioCareer(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="portfolio_careers",
        verbose_name="사용자",
    )
    order = OrderField()
    company = models.CharField("회사", max_length=128)
    company_en = models.CharField("영문 회사", max_length=128, blank=True, default="")
    position = models.CharField("직책", max_length=128)
    content = models.TextField("업무")
    content_en = models.TextField("영문 업무", blank=True, default="")
    join_date = models.DateField("입사일")
    leave_date = models.DateField("퇴사일", blank=True, null=True, help_text="재직 중이면 비워두세요.")

    class Meta:
        ordering = ["-order", "-id"]
        verbose_name = "포트폴리오 경력"
        verbose_name_plural = "포트폴리오 경력"

    @property
    def is_currently_employed(self):
        return self.leave_date is None

    @property
    def effective_leave_date(self):
        return timezone.localdate() if self.is_currently_employed else self.leave_date

    @classmethod
    def _calculate_rounded_month_period(cls, start_date, end_date):
        if not start_date or not end_date or end_date < start_date:
            return 0, 0

        years = end_date.year - start_date.year
        months = end_date.month - start_date.month
        days = end_date.day - start_date.day

        if days >= 15:
            months += 1

        if months < 0:
            years -= 1
            months += 12

        if months >= 12:
            years += months // 12
            months = months % 12

        return max(years, 0), max(months, 0)

    @property
    def display_period_rounded(self):
        years, months = self._calculate_rounded_month_period(self.join_date, self.effective_leave_date)
        parts = []
        if years:
            parts.append(f"{years}년")
        if months:
            parts.append(f"{months}개월")
        if not parts:
            return "0개월"
        return " ".join(parts)

    @property
    def display_period_en_rounded(self):
        years, months = self._calculate_rounded_month_period(self.join_date, self.effective_leave_date)
        parts = []
        if years:
            parts.append(f"{years} year")
        if months:
            parts.append(f"{months} month")
        if not parts:
            return "0 month"
        return " ".join(parts)

    @staticmethod
    def _format_korean_date(value):
        if not value:
            return ""
        return f"{value.year}년 {value.month}월 {value.day}일"

    @property
    def formatted_join_date(self):
        return self._format_korean_date(self.join_date)

    @property
    def formatted_leave_date(self):
        return self._format_korean_date(self.effective_leave_date)

    @property
    def formatted_date_range(self):
        return f"{self.formatted_join_date} ~ {self.formatted_leave_date}"

    def __str__(self):
        return f"{self.user} - {self.company}"


class PortfolioProject(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="portfolio_projects",
        verbose_name="사용자",
    )
    number = models.PositiveIntegerField("프로젝트 번호", blank=True, null=True)
    order = OrderField()
    title = models.CharField("제목", max_length=200)
    title_en = models.CharField("영문 제목", max_length=200, blank=True, default="")
    banner_img = models.ImageField("대표 이미지", upload_to=upload_to_portfolio_project, blank=True, null=True)
    tags = models.ManyToManyField(Project_Tag, verbose_name="태그", blank=True)
    content = models.TextField("내용")
    content_en = models.TextField("영문 내용", blank=True, default="")
    create_date = models.DateField("날짜")

    class Meta:
        ordering = ["-create_date", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["user", "number"], name="unique_portfolio_project_number_per_user"),
        ]
        verbose_name = "포트폴리오 프로젝트"
        verbose_name_plural = "포트폴리오 프로젝트"

    def save(self, *args, **kwargs):
        if self.number is None:
            max_number = (
                PortfolioProject.objects.filter(user=self.user)
                .aggregate(max_value=models.Max("number"))
                .get("max_value")
                or 0
            )
            self.number = max_number + 1
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.user} - #{self.number} {self.title}"


class PortfolioActionButton(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="portfolio_action_buttons",
        verbose_name="사용자",
    )
    order = models.PositiveSmallIntegerField("순서", default=1)
    label = models.CharField("표시 텍스트", max_length=40)
    url = models.URLField("URL", max_length=500)
    icon_url = models.URLField("아이콘 URL", max_length=500, blank=True, default="")
    created_at = models.DateTimeField("생성일", auto_now_add=True)
    updated_at = models.DateTimeField("수정일", auto_now=True)

    class Meta:
        ordering = ["order", "id"]
        constraints = [
            models.UniqueConstraint(fields=["user", "order"], name="unique_portfolio_action_button_order_per_user"),
        ]
        verbose_name = "포트폴리오 액션 버튼"
        verbose_name_plural = "포트폴리오 액션 버튼"

    def __str__(self):
        return f"{self.user} - {self.label}"
        
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
