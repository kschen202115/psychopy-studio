#!/usr/bin/env python3
"""Optional WebSocket dev server for the PsychoPy Studio Web backend.

All Builder/compile semantics live in the transport-agnostic
``official_core`` module. This file is now just a thin WebSocket transport
kept for local development and for diffing against the in-browser Pyodide
path. The production target runs ``official_core.handle_command`` entirely in
the browser via a Pyodide Web Worker (no server process).
"""

from __future__ import annotations

import asyncio
from typing import Any

import websockets

from official_core import (
    HOST,
    PORT,
    handle_command,
    logger,
    parse_command_message,
    send_error,
    send_ok,
)


async def handler(websocket: Any) -> None:
    logger.info("Accepted connection from %s", websocket.remote_address)
    async for message in websocket:
        msg_id = None
        try:
            msg_id, command, args, kwargs = parse_command_message(message)
            response = await asyncio.to_thread(handle_command, command, args, kwargs)
            await websocket.send(send_ok(msg_id, response))
        except websockets.exceptions.ConnectionClosed:
            # client navigated away/reloaded before the reply was ready
            logger.info("Client disconnected before receiving the reply")
            return
        except Exception as exc:
            logger.error("Command failed: %s", exc, exc_info=True)
            try:
                await websocket.send(send_error(msg_id, exc))
            except websockets.exceptions.ConnectionClosed:
                logger.info("Client disconnected before receiving the error reply")
                return


async def main() -> None:
    async with websockets.serve(handler, HOST, PORT, origins=None, max_size=32 * 1024 * 1024):
        logger.info("Official PsychoPy web backend listening on %s:%s", HOST, PORT)
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
