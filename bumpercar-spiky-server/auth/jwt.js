const jwt = require("jsonwebtoken")
const { JWT_SECRET, JWT_ISSUER, JWT_AUDIENCE } = require("../config/config")

// JWT 토큰을 검증하고 결과를 반환한다.
// JWT_SECRET 이 없는 개발 환경에서는 토큰 문자열 자체를 userId 로 사용한다.
// token: 검증할 JWT 문자열
// 반환값: { valid, userId, payload } 형태의 검증 결과 객체
function verifyToken(token) {
    if (!token) {
        return {
            valid: false,
            userId: null,
            payload: null
        }
    }

    // 비밀키가 없으면 개발 편의상 "토큰 문자열 자체를 userId 로 쓰는 모드"로 동작한다.
    // 운영에서는 이 경로를 타면 안 된다.
    if (!JWT_SECRET) {
        return {
            valid: true,
            userId: token,
            payload: null
        }
    }

    try {
        // Django 가 발급한 HS256 JWT 를 검증한다.
        // issuer / audience 까지 함께 맞아야 유효 토큰으로 본다.
        const payload = jwt.verify(token, JWT_SECRET, {
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE,
            algorithms: ["HS256"]
        })

        return {
            valid: true,
            userId: payload.userId || payload.sub || null,
            payload
        }
    } catch (error) {
        // 연결 단계에서는 에러를 밖으로 던지지 않고 invalid 로만 돌린다.
        return {
            valid: false,
            userId: null,
            payload: null
        }
    }
}

module.exports = {
    verifyToken
}
