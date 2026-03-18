from oauth2_provider.oauth2_validators import OAuth2Validator


class HanplanetOAuth2Validator(OAuth2Validator):
    """
    Forgejo SSO를 위한 커스텀 OAuth2Validator.
    OIDC id_token / userinfo에 email, nickname, preferred_username 클레임을 추가합니다.
    """

    def get_additional_claims(self, request):
        user = request.user
        return {
            "email": user.email,
            "email_verified": True,
            "nickname": user.username,
            "preferred_username": user.username,
            "name": user.get_full_name() or user.username,
        }
