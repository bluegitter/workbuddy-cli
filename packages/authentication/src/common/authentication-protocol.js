'use strict';

const AUTHENTICATION_PROVIDER_ID = 'codingcopilot';
const AuthenticationProvider = Symbol.for('workbuddy.authentication.AuthenticationProvider');
const AuthenticationStorage = Symbol.for('workbuddy.authentication.AuthenticationStorage');
const AuthenticationManager = Symbol.for('workbuddy.authentication.AuthenticationManager');
const ProductEnvService = Symbol.for('workbuddy.authentication.ProductEnvService');
const HTTP_HEADER_USER_ID = 'X-User-Id';
const HTTP_HEADER_ENTERPRISE_ID = 'X-Enterprise-Id';
const HTTP_HEADER_DEPARTMENT_INFO = 'X-Department-Info';
const HTTP_HEADER_TENANT_ID = 'X-Tenant-Id';
const HTTP_HEADER_DOMAIN = 'X-Domain';
const HTTP_HEADER_NO_USER_ID = 'X-No-User-Id';
const HTTP_HEADER_NO_ENTERPRISE_ID = 'X-No-Enterprise-Id';
const HTTP_HEADER_NO_DEPARTMENT_INFO = 'X-No-Department-Info';
const HTTP_HEADER_NO_AUTHORIZATION = 'X-No-Authorization';
const HTTP_HEADER_SKIP_AUTH_INTERCEPTOR = 'X-Skip-Auth-Interceptor';
const Edition = Object.freeze({ Pro: 'pro', Personal: 'personal', Ultimate: 'ultimate', Exclusive: 'exclusive' });
const AuthenticationStoragePriority = Object.freeze({ Disabled: 0, Low: 1, Normal: 5, Heigh: 9 });
const ProductEnviroment = Object.freeze({ External: 'external', Internal: 'internal', IOA: 'iOA', Selfhosted: 'selfhosted', Cloudhosted: 'cloudhosted' });
const ENV_KEY_CODEBUDDY_COPILOT_INTERNET_ENVIRONMENT = 'CODEBUDDY_COPILOT_INTERNET_ENVIRONMENT';
const X_USER_ID = HTTP_HEADER_USER_ID;
const AuthErrorCode = Object.freeze({ OpenExternalLinkFailed: 'AUTH_OPEN_EXTERNAL_LINK_FAILED', Sign: 'AUTH_SIGN_FAILED', Timeout: 'AUTH_TIMEOUT', Canceled: 'AUTH_CANCELED', IpLimit: 'AUTH_IP_LIMIT', Unauthorized: 'AUTH_UNAUTHORIZED', Network: 'AUTH_NETWORK_ERROR', PermissionDenied: 'AUTH_PERMISSION_DENIED', License: 'AUTH_LICENSE', Unknown: 'AUTH_UNKNOWN' });

class AuthenticationError extends Error { constructor(message, code) { super(message); this.name = this.constructor.name; this.code = code; } }
class TimeoutError extends AuthenticationError { constructor(message) { super(message, AuthErrorCode.Timeout); } }
class CanceledError extends AuthenticationError { constructor(message) { super(message, AuthErrorCode.Canceled); } }
class OpenExternalLinkError extends AuthenticationError { constructor(message) { super(message, AuthErrorCode.OpenExternalLinkFailed); } }
class SignError extends AuthenticationError { constructor(message) { super(message, AuthErrorCode.Sign); } }
class SignIpLimitError extends AuthenticationError { constructor(message) { super(message, AuthErrorCode.IpLimit); } }
class SignLicenseError extends AuthenticationError { constructor(code, msg) { super(msg, code); this.msg = msg; } }
class UnauthorizedError extends AuthenticationError { constructor(message) { super(message, AuthErrorCode.Unauthorized); } }

function getLogoutMarkerPath(authFilePath) { return `${authFilePath}.logged-out`; }

module.exports = { AUTHENTICATION_PROVIDER_ID, AuthenticationError, AuthenticationManager, AuthenticationProvider, AuthenticationStorage, AuthenticationStoragePriority, AuthErrorCode, CanceledError, Edition, ENV_KEY_CODEBUDDY_COPILOT_INTERNET_ENVIRONMENT, HTTP_HEADER_DEPARTMENT_INFO, HTTP_HEADER_DOMAIN, HTTP_HEADER_ENTERPRISE_ID, HTTP_HEADER_NO_AUTHORIZATION, HTTP_HEADER_NO_DEPARTMENT_INFO, HTTP_HEADER_NO_ENTERPRISE_ID, HTTP_HEADER_NO_USER_ID, HTTP_HEADER_SKIP_AUTH_INTERCEPTOR, HTTP_HEADER_TENANT_ID, HTTP_HEADER_USER_ID, OpenExternalLinkError, ProductEnvService, ProductEnviroment, SignError, SignIpLimitError, SignLicenseError, TimeoutError, UnauthorizedError, X_USER_ID, getLogoutMarkerPath };
