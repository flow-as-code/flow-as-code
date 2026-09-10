#!/usr/bin/env node
/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Writes the raster logo files, using a browser as the rasterizer.
//
//   node design/build-raster.mjs        then open the URL it prints
//
//   site/og.png                the 1200x630 card a link preview shows
//   site/logo.png              the banner the READMEs put at the top
//   site/apple-touch-icon.png  180x180, opaque, for an iOS home screen
//   site/favicon.ico           16, 32 and 48, for a browser tab
//
// It serves design/ on localhost, design/raster.html draws every image from the
// same modules the SVGs are generated from, posts the bytes back, and this
// process writes them into site/ and exits. Nothing leaves the machine and
// nothing is installed: nothing in this repository can decode or encode an
// image, and adding a toolchain that can, to draw four pictures that change
// once a year, would be a poor trade. The same approach produced the previous
// og.png (tasks/A14-hosted-demo.md).
//
// favicon.ico is assembled here rather than in the page, from the raw pixels a
// canvas hands over. The ICO container is a header, one directory entry per
// size, and a BMP for each: see `ico` below, and
// https://learn.microsoft.com/en-us/previous-versions/ms997538(v=msdn.10)

import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = join(fileURLToPath(new URL(".", import.meta.url)));
const SITE = join(HERE, "..", "site");
const PORT = Number(process.env.PORT ?? 8790);
const TYPES = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript" };

/** Every icon size the .ico will hold, smallest first, as raw RGBA. */
const pixels = new Map();
const written = [];

/**
 * One BMP image for an ICO directory: a 40 byte header claiming twice the
 * height, the pixels bottom-up as BGRA, then the 1 bit AND mask that predates
 * the alpha channel and that some renderers still consult.
 */
function bmp(size, rgba) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // colour rows plus mask rows
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);

  const colour = Buffer.alloc(size * size * 4);
  const maskStride = Math.ceil(size / 32) * 4;
  const mask = Buffer.alloc(maskStride * size);
  for (let y = 0; y < size; y += 1) {
    const row = size - 1 - y; // bottom-up
    for (let x = 0; x < size; x += 1) {
      const from = (y * size + x) * 4;
      const to = (row * size + x) * 4;
      colour[to] = rgba[from + 2];
      colour[to + 1] = rgba[from + 1];
      colour[to + 2] = rgba[from];
      colour[to + 3] = rgba[from + 3];
      if (rgba[from + 3] < 128) mask[row * maskStride + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return Buffer.concat([header, colour, mask]);
}

/** The ICO container: header, one directory entry per image, then the images. */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // 1 is an icon, 2 would be a cursor
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(16 * images.length);
  let offset = header.length + directory.length;
  const bodies = [];
  images.forEach(({ size, data }, i) => {
    const at = i * 16;
    directory.writeUInt8(size === 256 ? 0 : size, at);
    directory.writeUInt8(size === 256 ? 0 : size, at + 1);
    directory.writeUInt16LE(1, at + 4);
    directory.writeUInt16LE(32, at + 6);
    directory.writeUInt32LE(data.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += data.length;
    bodies.push(data);
  });
  return Buffer.concat([header, directory, ...bodies]);
}

function save(name, buffer) {
  writeFileSync(join(SITE, name), buffer);
  written.push(`site/${name} (${String(buffer.length)} bytes)`);
  console.log(`build-raster: wrote site/${name}, ${String(buffer.length)} bytes`);
}

const server = createServer((req, res) => {
  const done = (body) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(body);
  };

  if (req.method === "POST") {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString();
      const [, kind, name] = /^\/([a-z]+)\/?(.*)$/.exec(req.url) ?? [];
      if (kind === "png") {
        if (!/^[a-z-]+\.png$/.test(name)) {
          res.writeHead(400).end("not a png name");
          return;
        }
        save(name, Buffer.from(body, "base64"));
        done("saved");
      } else if (kind === "rgba") {
        pixels.set(Number(name), Buffer.from(body, "base64"));
        done("held");
      } else if (kind === "done") {
        const sizes = [...pixels.keys()].sort((a, b) => a - b);
        save(
          "favicon.ico",
          ico(sizes.map((size) => ({ size, data: bmp(size, pixels.get(size)) }))),
        );
        done("saved");
        console.log(`build-raster: ${written.join(", ")}`);
        console.log(`build-raster: favicon.ico holds ${sizes.join(", ")}.`);
        server.close();
      } else {
        res.writeHead(404).end("no such sink");
      }
    });
    return;
  }

  const path = req.url === "/" ? "/raster.html" : req.url;
  const file = join(HERE, normalize(path));
  if (!file.startsWith(HERE) || !existsSync(file)) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(
    `build-raster: open http://127.0.0.1:${String(PORT)}/ in a browser.\n` +
      "build-raster: the page draws the images and posts them back; this exits when it has them.",
  );
});
