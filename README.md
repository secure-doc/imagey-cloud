# imagey-server

## Local Testing and Registration

To test the application locally and complete the registration process, follow these steps:

1. Start the backend and database using `docker compose up -d` (the backend runs on port `8080`, and Greenmail runs on `8081`).
2. Start the frontend from the `imagey-web` folder using `npm run dev` (runs on port `5173` by default).
3. Open the frontend in your browser (`http://localhost:5173`) and enter an email address for registration. A message will appear confirming that a registration email has been sent.
4. Open Greenmail's OpenAPI UI at `http://localhost:8081/` and locate the endpoint to retrieve messages (e.g., `GET /api/user/{email}/messages/INBOX`).
5. Extract the registration link from the retrieved email body.
6. Replace the domain part of the extracted link (`https://imagey.cloud`) with your local frontend address (`http://localhost:5173` or the respective port).
7. Open the modified link in your browser to complete the registration by setting a password. You will then be logged in and can access features such as the user profile.

## Running Multiple Environments in Parallel

To run multiple features or branches in parallel on the same machine without port conflicts, you can override the default ports by providing environment variables. Docker Compose is set up to automatically map these if provided.

Run the following command, specifying unique ports for each instance:

```bash
MEECROWAVE_PORT=8082 SMTP_PORT=3026 IMAP_PORT=3144 GREENMAIL_API_PORT=8083 docker compose -p feature-branch up -d
```

*(Note: The `-p feature-branch` flag ensures Docker assigns unique container names. If you are starting `docker compose` from separate directories, Docker already generates unique project names automatically, so the `-p` parameter is not required.)*
