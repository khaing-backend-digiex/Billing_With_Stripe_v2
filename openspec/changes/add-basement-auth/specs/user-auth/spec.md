## ADDED Requirements

### Requirement: User Registration
The system SHALL provide a registration endpoint that creates a new User account with an associated Profile. The registration request SHALL accept email, password, username, firstname, lastname, and dateOfBirth. Email and password SHALL be stored in the User table. Username, firstname, lastname, and dateOfBirth SHALL be stored in the Profile table. The system SHALL validate that email conforms to standard email format. The system SHALL enforce a minimum password length of 6 characters. The system SHALL hash the password using bcrypt before persisting. The system SHALL create a Profile record linked to the User via a 1:1 relationship. The system SHALL assign the default USER role to newly registered users.

#### Scenario: Successful registration
- **GIVEN** no user exists with the provided email
- **WHEN** a registration request is submitted with a valid email, password of at least 6 characters, a username, firstname, lastname, and a dateOfBirth
- **THEN** the system creates a User record with a bcrypt-hashed password, creates a Profile record linked to the User with username, firstname, lastname, and dateOfBirth, assigns the USER role, and returns a success response

#### Scenario: Registration with duplicate email
- **GIVEN** a user already exists with the email "test@example.com"
- **WHEN** a registration request is submitted with the email "test@example.com"
- **THEN** the system rejects the request and returns an error indicating the email is already in use

#### Scenario: Registration with invalid email format
- **GIVEN** no prior state
- **WHEN** a registration request is submitted with an email that does not conform to standard email format (e.g., "notanemail")
- **THEN** the system rejects the request and returns a validation error indicating the email format is invalid

#### Scenario: Registration with short password
- **GIVEN** no prior state
- **WHEN** a registration request is submitted with a password shorter than 6 characters
- **THEN** the system rejects the request and returns a validation error indicating the password must be at least 6 characters

#### Scenario: Registration with missing required fields
- **GIVEN** no prior state
- **WHEN** a registration request is submitted without one or more required fields (email, password, username, firstname, lastname, or dateOfBirth)
- **THEN** the system rejects the request and returns a validation error listing the missing fields

### Requirement: User Login
The system SHALL provide a login endpoint that authenticates a user using email and password. The system SHALL compare the provided password against the stored bcrypt hash. On successful authentication, the system SHALL return an authentication response.

#### Scenario: Successful login
- **GIVEN** a registered user with email "user@example.com" and password "secret123"
- **WHEN** a login request is submitted with email "user@example.com" and the correct password "secret123"
- **THEN** the system authenticates the user and returns a success response with authentication data

#### Scenario: Login with incorrect password
- **GIVEN** a registered user with email "user@example.com"
- **WHEN** a login request is submitted with email "user@example.com" and an incorrect password
- **THEN** the system rejects the request and returns an authentication error

#### Scenario: Login with non-existent email
- **GIVEN** no user exists with the email "unknown@example.com"
- **WHEN** a login request is submitted with email "unknown@example.com" and any password
- **THEN** the system rejects the request and returns an authentication error

### Requirement: Password Hashing
The system SHALL hash all passwords using bcrypt with a minimum of 10 salt rounds before storing them in the database. The system SHALL never store plaintext passwords.

#### Scenario: Password stored as hash
- **GIVEN** a user submits a registration request with password "mypassword"
- **WHEN** the system persists the User record
- **THEN** the stored password value is a bcrypt hash and does not equal the plaintext "mypassword"

### Requirement: JWT Access Token Issuance
The system SHALL issue a signed JWT access token upon successful authentication. The token SHALL be signed using HS256 with a configurable secret and expiry. The token payload SHALL include the user id and the user's assigned role names. The token SHALL be returned in the login response body.

#### Scenario: Token issued on successful login
- **GIVEN** a registered user with email "user@example.com" and password "secret123"
- **WHEN** a login request is submitted with valid credentials
- **THEN** the system returns a success response containing a signed JWT access token in the response body

#### Scenario: Token contains user id and roles
- **GIVEN** a user with id "user-1" and roles ["USER"] successfully logs in
- **WHEN** the JWT access token is decoded
- **THEN** the payload contains the user id "user-1" and roles ["USER"]

#### Scenario: Token is signed and verifiable
- **GIVEN** a JWT access token has been issued
- **WHEN** the token is verified using the signing secret
- **THEN** the verification succeeds and the payload is intact; an altered or forged token fails verification

#### Scenario: No token issued on failed login
- **GIVEN** no prior state
- **WHEN** a login request is submitted with invalid credentials
- **THEN** the system rejects the request and does NOT issue a JWT access token
