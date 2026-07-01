# Ubiquitous Language

This document captures the ubiquitous language and domain model for the Imagey project.

## Core Domain

* **Document**: A file or resource managed within the system. It contains metadata and content. Documents are currently immutable (not editable).
* **Folder**: A specific type of Document (identified via `encryptedData.type = 'folder'`) used to group and organize other Documents.
  * *Relationship*: Many-to-Many (M:N) with Documents, implemented **bidirectionally** (Documents know their Folders, and Folders know their Documents). A Folder acts like a "Tag" or "Label". Deleting a Folder does not delete its Documents.
  * *Hierarchy*: Folders can be nested within other Folders.
  * *Sharing*: Folders can be shared with other users, similar to how Documents are shared.
  * *Future Editability*: If Documents become editable, editing a document linked in multiple Folders will require user confirmation on whether to apply the edit globally or branch off a copy.
