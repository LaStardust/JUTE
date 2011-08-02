/*
Copyright (c) 2011, Yahoo! Inc.
All rights reserved.

Redistribution and use of this software in source and binary forms, 
with or without modification, are permitted provided that the following 
conditions are met:

* Redistributions of source code must retain the above
  copyright notice, this list of conditions and the
  following disclaimer.

* Redistributions in binary form must reproduce the above
  copyright notice, this list of conditions and the
  following disclaimer in the documentation and/or other
  materials provided with the distribution.

* Neither the name of Yahoo! Inc. nor the names of its
  contributors may be used to endorse or promote products
  derived from this software without specific prior
  written permission of Yahoo! Inc.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS 
IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED 
TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A 
PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT 
OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, 
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT 
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, 
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY 
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT 
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE 
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/


module.exports = {
Create:  function(hub) {
    // Events I care about
    hub.addListener('startServer', startServer);

    function startServer() {

        var connect  = require('connect'),
            os       = require('os'),
            sys      = require('sys'),
            path     = require('path'),
            uuid     = require('node-uuid');

        hub.emit(hub.LOG, hub.INFO, "Running as " + process.getuid() + '/' + process.getgid());
        hub.emit(hub.LOG, hub.INFO, "Connect at http://" + os.hostname() + ':' + hub.config.port + '/');

        connect(
          connect.cookieParser()
        , connect.session({ secret: 'jute rox' })
        , connect.favicon()
        , connect.query()
        , function(req, res, next) {
            var sess = req.session;
            if (!sess.uuid) {
                sess.uuid = uuid();
                sess.cookie.expires = false;
            }
            next();
        }
        , connect.logger(hub.config.logFormat)
        , function(req, res, next) {
            if (req.query.selenium) {
                req.session.seleniumUUID = req.query.selenium;
            }
            next();
        }
        , connect.router(function(app){
            app.get('/jute_docs/:file', function(req, res, next){
                sendFullFile(path.join(__dirname, req.url), req, res, next);
            });
            app.get(/\/jute\/_([^\?]+)/, function(req, res, next){
                hub.emit('action', req.params[0], req, res);
            });
            app.post(/\/jute\/_([^\?]+)/, function(req, res, next){
                hub.emit('action', req.params[0], req, res);
            });
            app.get('/', function(req, res, next){
                res.writeHead(301, { Location: '/jute_docs/capture.html' });
                res.end();
            });
            /*
            app.get(/\/([^\?]+)/, function(req, res, next){
                // Fetching a TEST or SRC file!!
                // If this file has do_coverage=1 on it we may need to do
                //  something - otherwise it's just a static file
                //  lop off query string & send it
                sendFullFile(path.join(hub.config.docRoot, req.url), req, res, next);
            });
            */
        })
        , function(req, res, next) {
                sendFullFile(path.join(hub.config.docRoot, req.url), req, res, next);
                /*
                res.writeHead(301, { Location: '/jute_docs/capture.html' });
                res.end();
                */
        }
        ).listen(hub.config.port);

        hub.emit('serverStarted');
    }

    /*
     * Sucked mostly from connection/middleware/static
     */
    function sendFullFile(path, req, res, next) {

        var p = require('path'),
            exec = require('child_process').exec;

        path = path.replace(/\?.*/,''); // get rid of any query string

        // Coverage this bad boy!
        if (req.query.coverage && req.headers.referer.match('do_coverage=1')) {
            var tempFile = p.join('/tmp', p.basename(path));
            hub.emit(hub.LOG, hub.INFO, "Generating coverage file " + tempFile + " for " + path);
            exec(hub.config.java + ' -jar ' + p.join(__dirname, "yuitest-coverage.jar") + " -o " + tempFile + " " + path, function(err) {
                if (err) {
                    hub.emit(hub.LOG, 'error', "Error coverage'ing " + path + ": " + err);
                } else {
                    _doSend(tempFile, req, res, next);
                    // DO NOT delete coverage'd file for debugging
                }
            });
        } else {
            _doSend(path, req, res, next);
        }
    }

    function _doSend(path, req, res, next) {

        var fs = require('fs'),
            mime = require('mime');

        fs.stat(path, function(err, stat) {
            var type, charset,
                cutils = require('connect/lib/utils');

            if (err) {
                return 'ENOENT' == err.code ? next() : next(err);
            // ignore directories
            } else if (stat.isDirectory()) {
                next();
            }

            type = mime.lookup(path);

            res.setHeader('Content-Length', stat.size);
            res.setHeader('Last-Modified', new Date().toUTCString());

            // header fields
            if (!res.getHeader('content-type')) {
                charset = mime.charsets.lookup(type);
                res.setHeader('Content-Type', type + (charset ? '; charset=' + charset : ''));
            }

            fs.createReadStream(path).pipe(res);
        });
    }
}
};

