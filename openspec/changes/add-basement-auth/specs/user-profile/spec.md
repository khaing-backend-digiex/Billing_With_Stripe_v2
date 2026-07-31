## ADDED Requirements

### Requirement: Profile Creation on Registration
The system SHALL automatically create a Profile record when a new User is registered. The Profile SHALL be linked to the User via a 1:1 relationship using a unique foreign key constraint on `userId`. The Profile SHALL store the username, firstname, lastname, and dateOfBirth from the registration request.

#### Scenario: Profile created with registration
- **GIVEN** a successful user registration with username "johndoe", firstname "John", lastname "Doe", and dateOfBirth "1995-06-15"
- **WHEN** the User record is created
- **THEN** a Profile record is created with userId pointing to the User, username set to "johndoe", firstname set to "John", lastname set to "Doe", and dateOfBirth set to "1995-06-15"

#### Scenario: One profile per user
- **GIVEN** a User already has an associated Profile
- **WHEN** an attempt is made to create another Profile for the same User
- **THEN** the system rejects the operation due to the unique constraint on userId

### Requirement: Profile as Identity Hub
The Profile SHALL serve as the foreign key target for all non-auth domain tables (billing, subscriptions, etc.). Downstream tables SHALL reference Profile, not User, to maintain clean separation between auth credentials and business data.

#### Scenario: Downstream table references Profile
- **GIVEN** a downstream domain table (e.g., Invoice) needs to associate with a user
- **WHEN** the table schema is defined
- **THEN** the foreign key references Profile.id, not User.id

### Requirement: Profile Data Fields
The Profile SHALL contain the following fields: id (PK), userId (unique FK to User), username, firstname, lastname, dateOfBirth, avatar (optional, nullable), createdAt, and updatedAt. The avatar field SHALL be optional and nullable.

#### Scenario: Profile with avatar
- **GIVEN** a user has a Profile
- **WHEN** the avatar field is set to a URL string
- **THEN** the Profile stores the avatar URL and returns it when queried

#### Scenario: Profile without avatar
- **GIVEN** a user has a Profile
- **WHEN** the avatar field is not set
- **THEN** the avatar field is null and the Profile is still valid

### Requirement: Profile Separation from Auth Credentials
The Profile SHALL NOT contain the user's password or email. Email and password SHALL remain exclusively in the User table. This ensures auth credentials are isolated from identity data.

#### Scenario: Email only in User table
- **GIVEN** a registered user with email "user@example.com"
- **WHEN** the Profile is queried
- **THEN** the Profile does not contain an email field; email is only accessible via the User table

#### Scenario: Password only in User table
- **GIVEN** a registered user
- **WHEN** the Profile is queried
- **THEN** the Profile does not contain a password field; the hashed password is only accessible via the User table
