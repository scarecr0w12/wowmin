const http = require("http");
const { parseStringPromise } = require("xml2js");

/**
 * AzerothCore SOAP Client
 *
 * Connects to the worldserver SOAP interface to execute
 * console commands remotely.
 *
 * Default AzerothCore SOAP config:
 *   SOAP.Enabled = 1
 *   SOAP.IP       = "127.0.0.1"
 *   SOAP.Port     = 7878
 */
class SoapClient {
  /**
   * @param {object} opts
   * @param {string} opts.host     - SOAP host (default 127.0.0.1)
   * @param {number} opts.port     - SOAP port (default 7878)
   * @param {string} opts.username - account with SOAP access (security level 3+)
   * @param {string} opts.password - account password
   */
  constructor({ host = "127.0.0.1", port = 7878, username = "", password = "" } = {}) {
    this.host = host;
    this.port = port;
    this.username = username;
    this.password = password;
  }

  /**
   * Build the SOAP XML envelope for an executeCommand call.
   * AzerothCore uses namespace urn:AC and SOAP-RPC style.
   */
  _buildEnvelope(command) {
    // Escape XML special characters in the command
    const escaped = command
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<SOAP-ENV:Envelope',
      '  xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"',
      '  xmlns:SOAP-ENC="http://schemas.xmlsoap.org/soap/encoding/"',
      '  xmlns:ns1="urn:AC"',
      '  xmlns:xsd="http://www.w3.org/1999/XMLSchema"',
      '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
      "  <SOAP-ENV:Body>",
      "    <ns1:executeCommand>",
      `      <command>${escaped}</command>`,
      "    </ns1:executeCommand>",
      "  </SOAP-ENV:Body>",
      "</SOAP-ENV:Envelope>",
    ].join("\n");
  }

  /**
   * Execute a single command on the worldserver.
   * @param {string} command - server console command (e.g. ".server info")
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  executeCommand(command) {
    return new Promise((resolve, reject) => {
      const body = this._buildEnvelope(command);

      const options = {
        hostname: this.host,
        port: this.port,
        path: "/",
        method: "POST",
        auth: `${this.username}:${this.password}`,
        headers: {
          "Content-Type": "application/xml",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 10000,
      };

      const req = http.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", async () => {
          if (res.statusCode === 401) {
            return resolve({
              success: false,
              message: "Authentication failed – check username/password and SOAP security level.",
            });
          }

          try {
            const parsed = await parseStringPromise(data, {
              explicitArray: false,
              ignoreAttrs: true,
            });

            const envelope =
              parsed["SOAP-ENV:Envelope"] || parsed["soap:Envelope"] || parsed.Envelope;

            if (!envelope) {
              return resolve({ success: false, message: `Unexpected response:\n${data}` });
            }

            const soapBody =
              envelope["SOAP-ENV:Body"] || envelope["soap:Body"] || envelope.Body;

            // Check for SOAP fault
            const fault =
              soapBody?.["SOAP-ENV:Fault"] || soapBody?.["soap:Fault"] || soapBody?.Fault;
            if (fault) {
              const faultString = fault.faultstring || fault.faultString || "Unknown SOAP fault";
              return resolve({ success: false, message: String(faultString) });
            }

            // Successful response
            const result =
              soapBody?.["ns1:executeCommandResponse"]?.result ||
              soapBody?.executeCommandResponse?.result ||
              "";

            return resolve({ success: true, message: String(result).trim() });
          } catch (parseErr) {
            return resolve({
              success: false,
              message: `Failed to parse SOAP response:\n${data}\n\nError: ${parseErr.message}`,
            });
          }
        });
      });

      req.on("error", (err) => {
        reject(new Error(`Connection failed: ${err.message}`));
      });

      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Connection timed out – is the worldserver running with SOAP enabled?"));
      });

      req.write(body);
      req.end();
    });
  }

  /**
   * Test the connection by running ".server info".
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  async testConnection() {
    return this.executeCommand("server info");
  }
}

module.exports = SoapClient;
