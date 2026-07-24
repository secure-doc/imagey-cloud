# Test Data

The following test data is used for the integration tests

## Persons

The main persons are bob and mary. They are married and share all photos
(well, nearly all. Sometimes they want to make presents to each other
and discuss them with their friends).

Bob has three devices (a mobile phone, a tablet and a pc)
and Mary has two devices (a mobile phone and a tablet). 

The best friend of Bob is Chris.
Bob and Chris are together in a bowling club, too.
The third member of the bowling club is Jack.

Marys best friend is Alice.

## Data Migration
As of the transition to a Document-based chat architecture:
- All test data (Pact mock contracts, unit tests) have been migrated so that Chats are represented as Documents of type `Chat` stored in a user's root folder.
- Production data does **not** require migration.
