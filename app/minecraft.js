const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const os = require('os');
const _ = require('lodash');
const crypto = require('crypto');
const yauzl = require('yauzl');
var logger = require('log4js').getLogger();

const base = "data"

console.time("1.12.2");

/**
 * This class is made to handle multiple downloads at once. It is made to get
 * the data and write the data into file. So that being the case, you can use
 * `put` function to input `url` and download `path`, and it will return a
 * Promise. Once everything is downloaded, the promise gets fullfilled, if there
 * is any error, the requests that error did occur are saved in `failed` key in
 * resolved data.
 */
class DownloadsHandler {

  #jobs = {};

  constructor(threads) {
    this.threads = threads;
  }

  /**
   * Get a `job` from list of files that are going to get downloaded.
   * @param  {string} jobID  A user specified job ID, can be anything.
   * @return {Object}        A `job`(file to download) from files to download.
   */
  getJob(jobID) {
    if (this.#jobs[jobID].remaining) {
      var job = _.findLast(this.#jobs[jobID].files);
      this.#jobs[jobID].remaining -= 1;
      delete this.#jobs[jobID].files[job.id]
      logger.debug(`Sent job, ${jobID}`)
      // this.#jobs[jobID]
      return job;
    }
  }

  /**
   * By passing a specified name/id for a job, an array of files and optionally
   * a callback function that will run on every downloaded file, this function
   * starts downloading files in parallel.
   * @param  {string}   jobID A user specified job ID, can be anything.
   * @param  {array}   files  An array of files, files in dictionary with keys `url` and `path`.
   * @param  {Function} cb    A callback function that will get called on every file download.
   * @return {Promise}        A promise object that gets fullfilled when all the data is downloaded.
   */
  put(jobID, files, cb) {
    return new Promise((resolve, reject)=>{
      logger.debug(`Received job, ${jobID}`)
      // Check if the job name is already used.
      if (!(jobID in this.#jobs)) {
        // This part creates the base structure of a `job`. We pass the
        // `resolve` and `reject` functions so when it all gets downloaded, we
        // can call resolve or reject.
        // The structure of a `job` is something like this:
        // {
        //   total: 5,
        //   files: {
        //     '0': { url: 'asdqwd.com', path: 'ahe4567je4wa', id: '0' },
        //     '1': { url: 'asdqwd.com', path: 'ajyweajrtggtwea', id: '1' },
        //     '2': { url: 'asdqwd.com', path: 'ergtyerwa', id: '2' },
        //     '3': { url: 'asdqwd.com', path: 'asge5njegtwa', id: '3' },
        //     '4': { url: 'asdqwd.com', path: '456hj345wa', id: '4' }
        //   },
        //   remaining: 5,
        //   jobID: 'test',
        //   resolve: [Function],
        //   reject: [Function],
        //   finished: { total: 0 },
        //   failed: {}
        // }
        //
        this.#jobs[jobID] = {
          total: files.length,
          files: files.reduce((acc, cur, ind)=>{
            acc[ind] = {...cur, id: ind.toString()}
            return acc
          }, {}),
          remaining: files.length,
          jobID: jobID,
          resolve: resolve,
          reject: reject,
          finished: {
            total: 0
          },
          failed: {}
        };


        // If the file amount that we are going to download amount is less than
        // the amount of our downloading threads, do not create unnecessary
        // downloading threads.
        logger.debug(`Started downloading '${jobID}' with ${this.threads} threads.`)
        var fileAmount = (files.length < this.threads) ? files.length : this.threads;
        for (var i = 0; i < fileAmount; i++) {
          this.downloadFile(jobID, cb);
        }
      } else {
        reject(new Error("This `jobID` exists."))
      }
    })
  }


  /**
   * Download a file from a job that is specified with `jobID`.
   * @param  {string}   jobID A user specified job ID, can be anything.
   * @param  {Function} cb    A callback function that will get called on when the function completes downloading the file.
   * @return {Promise}        A promise object.
   */
  async downloadFile(jobID, cb) {
    if (this.#jobs[jobID].remaining) {

      // Get the job.
      var job = this.getJob(jobID);

      fetch(job.url).then((resp)=>{

        fs.stat(path.parse(job.path).dir, (err, stat)=>{
          if (err) {
            console.log(err);

            job.reason = err.message;

            // Add the failed job to the failed list so that we can process it
            // later.
            this.#jobs[jobID].failed[job.id] = job;

            // Add as finished as the main thread is responsible for failed jobs.
            this.#jobs[jobID].finished.total += 1;
          } else {

            // Write data into file.
            const file = fs.createWriteStream(job.path);
            resp.body.pipe(file);

            file.on("close", ()=>{

              this.#jobs[jobID].finished[job.id] = job
              this.#jobs[jobID].finished.total += 1;

              if (cb) {
                cb(this.#jobs[jobID].finished.total, this.#jobs[jobID].total)
              }

              console.info(`Downloaded: ${job.url}`);

              if ( this.#jobs[jobID].finished.total == this.#jobs[jobID].total &&
                !this.#jobs[jobID].remaining ) {

                // Mark the job as finished.
                this.#jobs[jobID].resolve(this.#jobs[jobID])

              } else {
                this.downloadFile(jobID, cb)
              }
            })
          }
        });
      }).catch((err)=>{

        // Add the failed job to the failed list so that we can process it
        // later.
        job.reason = err.message;
        this.#jobs[jobID].failed[job.id] = job;

        // Add as finished as the main thread is responsible for failed jobs.
        this.#jobs[jobID].finished.total += 1;
      })
      // console.log(_.some(this.#jobs[jobID]));
      // var job = this.#threads[jobID]
    }
  }

}

/**
 * This class has basically became a library for minecraft game files but I can
 * not say that for now as it is not well constructed to become a library.
 */
class Minecraft {

  downloader;
  versionInfo;
  assetInfo;
  fileList;
  game = {};
  user = {};
  /**
   * Initializes `DownloadsHandler` for fast downloading.
   */
  constructor(type) {
    this.downloader = new DownloadsHandler(8);
    this.type = type;
  }

  async initialize(version) {

    this.game.version = version;

    return new Promise(async(resolve, reject)=>{
      this.versionInfo = await Minecraft.getManifest().then((manifest)=>{
        return Minecraft.getVersionInfo(version, manifest);
      }).catch((err)=>{
        reject(err);
      })

      this.assetInfo = await Minecraft.getAssetsInfo(version, this.versionInfo).catch((err)=>{
        reject(err);
      });

      resolve();
    })
  }

  /**
   * Get manifest JSON data.
   * @return {Promise}     Returns a promise object.
   */
  static getManifest() {

    const manifestPath = `${base}/version_manifest.json`;
    const endpoint = "https://launchermeta.mojang.com/mc/game/version_manifest.json";

    return new Promise(async (resolve, reject)=>{
      fs.stat(manifestPath, (err, stats)=>{
        if (err) {
          if (err.code == "ENOENT") {
            fetch(endpoint).then( resp => resp.json() ).then((resp)=>{
              fs.mkdir(path.parse(manifestPath).dir, { recursive: true }, (err)=>{
                if (err) { reject(err) } else {
                  fs.writeFile(manifestPath, JSON.stringify(resp), (err)=>{
                    if (err) {
                      reject(err);
                    } else {
                      resolve(resp);
                    }
                  })
                }
              });
            }).catch((err)=>{
              reject(err)
            })
          } else {
            reject(err);
          }
        } else {
          resolve(
            JSON.parse(fs.readFileSync(manifestPath))
          )
        }
      })
    })
  }


  /**
   * Gets version information of specified version. Has data about files to
   * download or check.
   * @param  {string} version  Game version.
   * @param  {Object} manifest Manifest JSON data that comes from `getManifest` function.
   * @return {Promise}         Returns a promise object.
   */
  static getVersionInfo(version, manifest) {

    const versionPath = `${base}/versions/${version}/${version}.json`;

    return new Promise((resolve, reject)=>{
      fs.stat(versionPath, (err, stats)=>{
        if (err) {
          if (err.code == "ENOENT") {
            fs.mkdir(path.parse(versionPath).dir, { recursive: true }, (err)=>{
              if (!err) {
                let url = _.find(manifest.versions, { "id": version }).url;
                fetch(url).then( resp => resp.json() ).then((resp)=>{
                  fs.writeFile(versionPath, JSON.stringify(resp), (err)=>{
                    if (err) {
                      reject(err)
                    } else {
                      resolve(resp)
                    }
                  })
                }).catch((err)=>{
                  reject(err)
                })
              } else {
                reject(err);
              }
            })
          } else {
            reject(err);
          }
        } else {
          fs.readFile(versionPath, (err, data)=>{
            if (err) { reject(err) } else {
              resolve(JSON.parse(data))
            }
          })
        }
      })
    })
  }

  /**
   * Get asset information with `versionInfo`.
   * @param  {Object} versionInfo Version JSON data that comes from `getVersionInfo` function.
   * @return {Promise}             A promise object.
   */
  static getAssetsInfo(version, versionInfo) {

    // [16:45:27] [Client thread/ERROR]: Can't find the resource index file: C:\Users\duoqu\Documents\mclaunch\app\data\assets\1.12.2\indexes\1.12.json
    const assetFile = `${base}/assets/${version}/indexes/${versionInfo.assets}.json`;

    return new Promise((resolve, reject)=>{

      fs.stat(assetFile, (err, stats)=>{
        if (err) {
          if (err.code == "ENOENT") {
            fetch(versionInfo.assetIndex.url)
            .then( resp => resp.json() )
            .then((resp)=>{
              console.log(path.parse(assetFile).dir);
              fs.mkdir(path.parse(assetFile).dir, { recursive: true }, (err)=>{
                if (err) { reject(err) } else {
                  fs.writeFile(assetFile, JSON.stringify(resp), (err)=>{
                    if (err) { reject(err) } else {
                      resolve(resp);
                    }
                  })
                }
              })
            })
          } else {
            reject(err)
          }
        } else {
          fs.readFile(assetFile, (err, data)=>{
            if (err) { reject(err) } else {
              resolve(JSON.parse(data));
            }
          })
        }
      })
    })
  }


  /**
   * Checks minecraft files.
   * @param  {string} version Game version.
   * @param  {Function} cb    Callback function that will run on every check.
   * @return {Promise}        Returns a promise object.
   */
  checkFiles(cb) {

    const gameFile = `${base}/versions/${this.game.version}/fileData.json`;
    var extracting = [];
    var checkAgain = false;

    return new Promise(async (resolve, reject)=>{

      await new Promise((res, rej)=>{
        fs.stat(gameFile, async (err)=>{
          if (err) {
            if (err.code == "ENOENT") {
              // Subject to change as I may implement forge or things like that.
              this.fileList = await this.getOfficialList(this.versionInfo, this.assetInfo, this.game.version);
              fs.writeFile(gameFile, JSON.stringify(this.fileList), (err)=>{
                if (err) { rej(err) } else {
                  res();
                }
              })

            }
          } else {
            fs.readFile(gameFile, (err, data)=>{
              if (err) { rej(err) } else {
                this.fileList = JSON.parse(data);
                res();
              }
            })
          }
        })
      }).catch((err)=>{
        reject(err)
      })


      var downList = [];
      var hashChecks = [];


      for (var file in this.fileList) {
        if (this.fileList[file].download) {
          await new Promise((res, rej)=>{
            fs.stat(file, async (err)=>{
              if (err) {
                if (err.code == "ENOENT") {
                  downList.push({
                    url: this.fileList[file].url,
                    path: this.fileList[file].path
                  })

                  fs.mkdir(path.parse(this.fileList[file].path).dir,
                    { recursive: true },
                    (err)=>{
                      if (err) {
                        rej(err)
                      } else {
                        res();
                      }
                  })
                }
              } else {
                // Hash check here...
                // Will check if it works later...
                hashChecks.push(Minecraft.sha1Sum(file).then((sum)=>{
                  if (sum == this.fileList[file].hash) {
                    res();
                  } else {
                    fs.unlink(file, (err)=>{
                      console.log(`Removed corrupted file '${file}'`);
                      if (err) { rej(err) } else {
                        downList.push({
                          url: this.fileList[file].url,
                          path: this.fileList[file].path
                        })
                        res();
                      }
                    })
                  }
                }).catch((err)=>{
                  if (err) { rej(err) };
                }));
              }
            })
          })
        }

        if (this.fileList[file].download && this.fileList[file].extract) {
          if (!this.fileList[file].extracted) {
            checkAgain = true;
            // If the file is going to be downloaded, do not try to extract.
            if (!_.find(downList, { path: file })) {
              extracting.push(Minecraft.extractJar(this.fileList[file]))
            }

          } else {
            //console.log(fileList[file]);
            var cursor = this.fileList[file];
            this.fileList[file].extracted.forEach((f)=>{
              fs.stat(f.file, (err)=>{
                if (err) {
                  checkAgain = true;
                  if (!_.find(downList, { path: cursor.path })) {
                    extracting.push(Minecraft.extractJar(cursor))
                  }
                } else {
                  hashChecks.push(new Promise((res, rej)=>{
                  //  console.log(f.file);
                    Minecraft.sha1Sum(f.file).then((sum)=>{
                      //console.log(f.file);
                      //console.log("________________________________");
                      if (sum == f.hash) {
                        res();
                      } else {
                        fs.unlink(f.file, (err)=>{
                          if (err) { rej(err) } else {
                            checkAgain = true;
                            res();
                          }
                        })
                      }
                    })
                  }))
                }
              })
            })
          }
        }
      }

      console.log("First check pass.");

      if (checkAgain) {
        console.log("There are files to extract");
      } else {
        console.log("No files to extract.");
      }


      await Promise.all(hashChecks).then((asd)=>{

      }).catch((err)=>{
        console.log(err);
      })

      // Wait for files to get extracted.
      await Promise.all(extracting).then((extracted)=>{
        fs.writeFile(gameFile, JSON.stringify(this.fileList), (err)=>{
          console.log("Saved fileData.json");
          if (err) {
            reject(err);
          }
        })
      }).catch((err)=>{
        reject(err);
      })


      // If there is stuff to download, download and wait for them to finish.
      if (downList.length) {
        await this.downloader.put(this.version, downList, (a, b)=>{
          // This callback will go to the client to visualize the progress.
          console.log(`[${a}/${b}]`);
        });
      }

      resolve("TEST")
      // // Will look into that later
      // if (checkAgain) {
      //   this.checkFiles(version, cb)
      // }

    })
  }

  genCMD(user = "demo") {
    //this.game.cmd

    //  net.minecraft.client.main.Main
    // --username Duoquote
    // --version 1.12.2
    // --gameDir C:\Users\duoqu\AppData\Roaming\.minecraft
    // --assetsDir C:\Users\duoqu\AppData\Roaming\.minecraft\assets
    // --assetIndex 1.12
    // --uuid a222ad0383614ce58a784b844a59a8f8
    // --accessToken -
    // --userType mojang
    // --versionType release

    var baseArgs;

    // For testing purposes only, I added this manually, will fetch
    // automatically in the future.
    var javawEXE = '"C:\\Program Files (x86)\\Minecraft Launcher\\runtime\\jre-x64\\bin\\javaw.exe"'


    // \${(\w+)}


    if ("minecraftArguments" in this.versionInfo) {
      baseArgs = this.versionInfo.minecraftArguments;
    } else {
      baseArgs = this.versionInfo.arguments.game.filter(
        obj => typeof(obj) == "string"
      ).join(" ");
    }

    [...baseArgs.matchAll(/\$\{(\w+)\}/g)].forEach((arg)=>{
      switch (arg[1]) {
        case "version_type":
          baseArgs = baseArgs.replace(arg[0], this.versionInfo.type)
          break;
        case "version_name":
          baseArgs = baseArgs.replace(arg[0], this.game.version)
          break;
        case "auth_player_name":
          baseArgs = baseArgs.replace(arg[0], user)
          break;
        case "assets_index_name":
          baseArgs = baseArgs.replace(arg[0], this.versionInfo.assets)
          break;
        case "game_directory":
          baseArgs = baseArgs.replace(arg[0], path.resolve(`${base}`))
          break;
        case "user_type":
          baseArgs = baseArgs.replace(arg[0], ("uuid" in this.user) ? "mojang" : "offline")
          break;
        case "assets_root":
          baseArgs = baseArgs.replace(arg[0], path.resolve(`${base}/assets/${this.game.version}`))
          break;
        case "auth_access_token":
          baseArgs = baseArgs.replace(arg[0], "offline")
          break;
        case "auth_uuid":
          baseArgs = baseArgs.replace(arg[0], "offline");
          break;
      }
    })


    var javaArgs = [];
    javaArgs.push(`-Djava.library.path="${path.resolve(base, this.game.version, "natives")}"`);
    javaArgs.push(`-Dminecraft.client.jar="${path.resolve(base, this.game.version, "client.jar")}"`);
    //javaArgs += `-cp ${_.find()}`

    javaArgs.push("-cp");
    javaArgs.push(_.filter(this.fileList, _.conforms(
        { type: _.partial(_.includes, ["lib", "client"]) }
      ))
      .map( a => path.resolve(a.path))
      .join(path.delimiter))
    //console.log(lib);
    javaArgs.push("-Xmx2G -XX:+UnlockExperimentalVMOptions -XX:+UseG1GC -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=50 -XX:G1HeapRegionSize=32M");


    //console.log(baseArgs);

    // For now, remove uuid and accessToken args as I didn't implement login
    // system.
    //baseArgs = baseArgs.replace(/--(uuid|accessToken) \$\{.*?\} ?/g, "");

    fs.writeFileSync("test.bat", _.flatten([javawEXE, javaArgs, this.versionInfo.mainClass, baseArgs]).join(" "))

    //console.log(baseArgs);

  }

  /**
   * Extracts a JAR file, not specifically a jar file, it will extract any zip
   * file.
   * @param  {Object} file A file object, should contain `path` key that
   * contains the path to zip file, `extractPath` key that contains the path to
   * folder to extract, `exclude` key to exclude a files given with array and
   * `extracted` key to store extracted files info.
   * @return {Promise}      Returns a promise object.
   */
  static extractJar(file) {

    var extractedList = [];

    return new Promise((resolve, reject)=>{
      yauzl.open(file.path, { lazyEntries: true }, (err, zip)=>{
        if (err) { reject(err) } else {
          zip.readEntry();
          zip.on("end", async ()=>{
            file.extracted = extractedList;
            resolve(file);
          })
          zip.on("entry", (entry)=>{
            if (file.exclude.filter( ex => entry.fileName.startsWith(ex)).length){
              zip.readEntry();
            } else {
              zip.openReadStream(entry, (err, stream)=>{
                if (err) { reject(err) } else {
                  let exFile = path.join(file.extractPath, entry.fileName);
                  fs.stat(path.parse(exFile).dir, (err)=>{
                    if (err) {
                      if (err.code == "ENOENT") {
                        fs.mkdir(path.parse(exFile).dir, (err)=>{
                          if (err) { reject(err) } else {
                            let fsStream = fs.createWriteStream(exFile);
                            stream.on("end", async ()=>{
                              let exHash = await Minecraft.sha1Sum(exFile);
                              extractedList.push({ file: exFile, hash: exHash });
                              zip.readEntry();
                            })
                            stream.pipe(fsStream);
                          }
                        })
                      }
                    } else {
                      let fsStream = fs.createWriteStream(exFile);
                      stream.on("end", async ()=>{
                        let exHash = await Minecraft.sha1Sum(exFile);
                        extractedList.push({ file: exFile, hash: exHash });
                        zip.readEntry();
                      })
                      stream.pipe(fsStream);
                    }
                  })
                }
              })
            }
          })
        }
      })
    })
  }

  /**
   * Get sha1 sum of a file as hex string.
   * @param  {String} file The path to the file to calculate the hash of.
   * @return {Promise}      Returns a promise object.
   */
  static sha1Sum(file) {
    return new Promise((resolve, reject)=>{
      const shasum = crypto.createHash("sha1");
      const fsStream = fs.createReadStream(file);
      fsStream.on("readable", ()=>{
        const data = fsStream.read();
        if (data) {
          shasum.update(data)
        } else {
          resolve(shasum.digest("hex"))
        }
      })
    })
  }


  /**
   * Gets and prepares official game file list of minecraft, it is a function on
   * it's on because I may implement other things like forge so these will have
   * their own functions too.
   * @param  {Object} versionInfo Version info data from `getVersionInfo` function.
   * @param  {Object} assetInfo   Asset info data from `getAssetsInfo` function.
   * @param  {String} version     The game version to prepare list of files.
   * @return {Promise}             Returns a promise object that gets fullfilled
   * when everything is prepared.
   */
  getOfficialList(versionInfo, assetInfo, version) {

    // Checklist:
    // [x] Handle client.jar, server.jar.
    // [x] Handle library files.
    // [x] Handle native files.
    // [x] Handle version assets. Put them in a public directory, accessible
    // across different game versions.
    // [-] Fix rule parsing as it's temporary.
    return new Promise((resolve, reject)=>{

      var fileList = {};

      // Get os info.
      const arch = process.arch.replace("x", "");
      var platform;
      switch (os.platform()) {
        case "win32":
          platform = "windows"
          break;
        case "darwin":
          platform = "osx"
          break;
        case "linux":
          platform = "linux"
          break;
      }

      // Add client.jar rightaway, mark as download.
      fileList[`${base}/${this.game.version}/client.jar`] = {
        path: `${base}/${this.game.version}/client.jar`,
        url: versionInfo.downloads.client.url,
        hash: versionInfo.downloads.client.sha1,
        download: true,
        extract: false,
        exclude: false,
        type: "client"
      }


      // Add server.jar rightaway, mark as not to download.
      fileList[`${base}/${this.game.version}/server/server.jar`] = {
        path: `${base}/${this.game.version}/server/server.jar`,
        url: versionInfo.downloads.server.url,
        hash: versionInfo.downloads.server.sha1,
        download: false,
        extract: false,
        exclude: false,
        type: "server"
      }


      // Process library files.
      versionInfo.libraries.forEach((lib)=>{

        // If there is artifact(library file), check whether to download or not
        // based on the os rules and process accordingly.
        if ("artifact" in lib.downloads) {
          let artifactPath;
          if ("rules" in lib) {
            if (this.parseRule(lib.rules, platform)) {
              artifactPath = `${base}/${this.game.version}/libraries/${lib.downloads.artifact.path}`;
              fileList[artifactPath] = {
                path: artifactPath,
                url: lib.downloads.artifact.url,
                hash: lib.downloads.artifact.sha1,
                download: true,
                extract: false,
                exclude: false,
                type: "lib"
              }
            }
          } else {
            artifactPath = `${base}/${this.game.version}/libraries/${lib.downloads.artifact.path}`;
            fileList[artifactPath] = {
              path: `${base}/${this.game.version}/libraries/${lib.downloads.artifact.path}`,
              url: lib.downloads.artifact.url,
              hash: lib.downloads.artifact.sha1,
              download: true,
              extract: false,
              exclude: false,
              type: "lib"
            }
          }
        }



        // Add os specific files to the list called as `natives`.
        // Checklist:
        // [x] Replace ${arch} with `64` or `32`.
        // [x] Add a special if statement for `lib.downloads.classifiers` as the
        // documentation give no information about when they put the os in
        // `lib.natives` list, it actually may not be in
        // `lib.downloads.classifiers`.
        var native;

        if ("classifiers" in lib.downloads) {
          if (platform in lib.natives) {
            let nativePath;
            if ("rules" in lib) {
              if (this.parseRule(lib.rules, platform)) {
                native = lib.natives[platform].replace("${arch}", arch)
                if (native in lib.downloads.classifiers) {
                  nativePath = `${base}/${this.game.version}/natives/archive/${path.parse(lib.downloads.classifiers[native].path).base}`;
                  fileList[nativePath] = {
                    path: nativePath,
                    url: lib.downloads.classifiers[native].url,
                    hash: lib.downloads.classifiers[native].sha1,
                    download: true,
                    extract: ("extract" in lib) ? true : false,
                    extractPath: `${base}/${this.game.version}/natives/`,
                    exclude: ("extract" in lib) ? lib.extract.exclude : false,
                    type: "native"
                  }
                }
              }
            } else {
              native = lib.natives[platform].replace("${arch}", arch);
              if (native in lib.downloads.classifiers) {
                nativePath = `${base}/${this.game.version}/natives/archive/${path.parse(lib.downloads.classifiers[native].path).base}`;
                fileList[nativePath] = {
                  path: nativePath,
                  url: lib.downloads.classifiers[native].url,
                  hash: lib.downloads.classifiers[native].sha1,
                  download: true,
                  extract: ("extract" in lib) ? true : false,
                  extractPath: `${base}/${this.game.version}/natives/`,
                  exclude: ("extract" in lib) ? lib.extract.exclude : false,
                  type: "native"
                }
              }
            }
          }
        }
      })

      // Handling of asset files.
      for (var k in assetInfo.objects) {
        let hash = assetInfo.objects[k].hash;
        let assetPath = `${base}/assets/${versionInfo.assets}/objects/${hash.substr(0, 2)}/${hash}`;
        fileList[assetPath] = {
          path: assetPath,
          copyTo: `${base}/assets/${versionInfo.assets}/virtual/legacy/${hash.substr(0, 2)}/${hash}`,
          url: `http://resources.download.minecraft.net/${hash.substr(0, 2)}/${hash}`,
          hash: hash,
          download: true,
          extract: false,
          exclude: false,
          type: "asset"
        }
      }

      // Pass the file list of official game files.
      resolve(fileList);

    })
  }

  parseRule(rules, os) {

    // This part is subject to change. It is made for temporary usage as it
    // doesn't really matter for releases.
    // https://minecraft.gamepedia.com/Client.json
    // On the address above, found information about how to actually handle this
    // part, will work on it soon.
    var rule = _.filter(rules, (o)=>{
      return "os" in o
    })[0];

    var down;

    if (rule.action == "allow" && os == rule.os.name) {
      down = true;
    } else if (rule.action == "disallow" && !(os == rule.os.name)) {
      down = true;
    } else {
      down = false;
    }

    return down;
  }
}

var minecraft = new Minecraft("official");
minecraft.initialize("1.12.2").then(()=>{
  minecraft.checkFiles().then(()=>{
    minecraft.genCMD();
  })
})

// var minecraft = new Minecraft("official");
// minecraft.initialize("1.16.1").then(()=>{
//   minecraft.checkFiles().then(()=>{
//     minecraft.genCMD();
//   })
// })

// console.log(minecraft.genArgs("official", "1.12.2"));

// minecraft.checkFiles("1.12.2").then(()=>{
//   minecraft.checkFiles("1.12.2").then(()=>{
//     console.timeEnd("1.12.2");
//   })
// })



// minecraft.checkFiles("1.8.8")
// minecraft.checkFiles("1.8")
// minecraft.checkFiles("1.4.7")
// minecraft.checkFiles("1.7.2")
// minecraft.checkFiles("1.4.5")
// minecraft.checkFiles("1.11")
// minecraft.checkFiles("1.7")
// minecraft.checkFiles("1.9")
// minecraft.checkFiles("1.16.1")



// var downloader = new DownloadsHandler();
//
// var queue = downloader.put("test", [
//   {url: "https://libraries.minecraft.net/org/lwjgl/lwjgl-opengl/3.2.2/lwjgl-opengl-3.2.2.jar", path: "app/data/ahe4567je4wa.jar"},
//   {url: "https://libraries.minecraft.net/org/lwjgl/lwjgl-opengl/3.2.2/lwjgl-opengl-3.2.2.jar", path: "app/data/ajyweajrtggtwea.jar"},
//   {url: "https://libraries.minecraft.net/org/lwjgl/lwjgl-opengl/3.2.2/lwjgl-opengl-3.2.2.jar", path: "app/data/ergtyerwa.jar"},
//   {url: "https://libraries.minecraft.net/org/lwjgl/lwjgl-opengl/3.2.2/lwjgl-opengl-3.2.2.jar", path: "app/data/asge5njegtwa.jar"},
//   {url: "https://libraries.minecraft.net/org/lwjgl/lwjgl-opengl/3.2.2/lwjgl-opengl-3.2.2.jar", path: "app/data/456hj345wa.jar"},
//   // {url: "asdqwd.com", path: "awerxxr6ue4ha"},
//   // {url: "asdqwd.com", path: "aghe45ewa"},
//   // {url: "asdqwd.com", path: "ahs4567a"},
//   // {url: "asdqwd.com", path: "ase56je45wa"},
//   // {url: "asdqwd.com", path: "7he4576h6e4wa"},
//   // {url: "asdqwd.com", path: "45s6u456wa"},
//   // {url: "asdqwd.com", path: "ashe567w5fwa"}
// ]).then((result)=>{
//   console.log(result);
// })

// module.exports = {
//   getManifest: getManifest,
//   getVersionInfo: getVersionInfo,
//   DownloadsHandler: DownloadsHandler
// }
