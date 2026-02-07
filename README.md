# License Delivery Automation

This repository demonstrates the core idea and architecture of a webhook-based license delivery automation service.
Some parts of the original production system were removed or simplified for security and privacy reasons.

## What it does
- Receives order webhooks
- Asks the customer to type `license` to start the process
- Asks for the name to be printed on the license
- Runs an external license creation tool (provided locally)
- Returns a delivery link (upload integration is a placeholder)
- Forwards messages using a configurable sender

## Notes
- This is not a full production-ready system.
- Credentials, tokens and real integrations are intentionally omitted.
- The project focuses on showing the message flow and automation logic.
