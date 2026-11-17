"""embedgym_parts — part models authored for EmbedGym, kept out of the upstream model
files (esp32_i2c_slaves.py, esp32_spi_slaves.py, …) so upstream merges don't
conflict with our additions. The worker-side twin of parts/sim/.

Rules:
 - Every net-new part model lives in its own file here, one part per file,
   named after the part; bus-attached parts go under a folder per bus (i2c/).
   Never append a model to an upstream model file.
 - An upstream model we change gets its own copy here, and the upstream
   file stays as upstream ships it.
 - Nothing here imports an upstream module.
 - registry.py builds each shared part model and wires it through its host:
   the ESP32-S3 and nRF52840 workers, and the AVR simulator. Such a part's
   frontend glue sends only circuit facts and values; its behavior is here.
 - The workers import these as top-level `embedgym_parts.…` modules from
   PYTHONPATH; the browser loads them into Pyodide for the AVR
   (velxio/frontend/src/simulation/python/), so they use the standard
   library only.
"""
