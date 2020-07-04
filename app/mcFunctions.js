const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const os = require('os');
const _ = require('lodash');


const base = "data"



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

  constructor() {

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
        var fileAmount = (files.length < 4) ? files.length : 4;
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


class Minecraft {

  constructor() {}

  /**
   * Get manifest JSON data.
   * @return {Promise}     Returns a promise object.
   */
  static getManifest() {

    const manifestPath = path.resolve(__dirname, `${base}/version_manifest.json`);
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
   * @param  {Object} manifest Manifest JSON.
   * @return {Promise}         Returns a promise object.
   */
  static getVersionInfo(version, manifest) {

    const versionPath = path.resolve(__dirname, `${base}/versions/${version}/${version}.json`);

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

  static getAssetsInfo(versionInfo) {

    const assetFile = path.resolve(__dirname, `${base}/assets/${versionInfo.assets}.json`);

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
  checkFiles(version, cb) {
    return new Promise(async (resolve, reject)=>{

      // Get version info.
      const versionInfo = await Minecraft.getManifest().then((manifest)=>{
        return Minecraft.getVersionInfo(version, manifest);
      }).catch((err)=>{
        reject(err);
      })

      const assetInfo = await Minecraft.getAssetsInfo(versionInfo).catch((err)=>{
        reject(err);
      });

      this.getOfficialList(versionInfo, assetInfo, version).then((data)=>{
        console.log(data);
      });

    })
  }



  getOfficialList(versionInfo, assetInfo, version) {

    // Checklist:
    // [x] Handle client.jar, server.jar.
    // [x] Handle library files.
    // [x] Handle native files.
    // [-] Handle version assets. Put them in a public directory, accessible
    // across different game versions.
    // [-] Fix rule parsing as it's temporary.
    return new Promise((resolve, reject)=>{

      var fileList = [];

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
      fileList.push({
        path: `${base}/${version}/client.jar`,
        url: versionInfo.downloads.client.url,
        hash: versionInfo.downloads.client.sha1,
        download: true,
        extract: false,
        exclude: false,
        type: "client"
      })


      // Add server.jar rightaway, mark as not to download.
      fileList.push({
        path: `${base}/${version}/server/server.jar`,
        url: versionInfo.downloads.server.url,
        hash: versionInfo.downloads.server.sha1,
        download: false,
        extract: false,
        exclude: false,
        type: "server"
      })


      // Process library files.
      versionInfo.libraries.forEach((lib)=>{

        // If there is artifact(library file), check whether to download or not
        // based on the os rules and process accordingly.
        if ("artifact" in lib.downloads) {
          if ("rules" in lib) {
            if (this.parseRule(lib.rules, platform)) {
              fileList.push({
                path: `${base}/${version}/libraries/${lib.downloads.artifact.path}`,
                url: lib.downloads.artifact.url,
                hash: lib.downloads.artifact.sha1,
                download: true,
                extract: false,
                exclude: false,
                type: "lib"
              })
            }
          } else {
            fileList.push({
              path: `${base}/${version}/libraries/${lib.downloads.artifact.path}`,
              url: lib.downloads.artifact.url,
              hash: lib.downloads.artifact.sha1,
              download: true,
              extract: false,
              exclude: false,
              type: "lib"
            })
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
            if ("rules" in lib) {
              if (this.parseRule(lib.rules, platform)) {
                native = lib.natives[platform].replace("${arch}", arch)
                if (native in lib.downloads.classifiers) {
                  fileList.push({
                    path: `${base}/${version}/natives/archive/${path.parse(lib.downloads.classifiers[native].path).base}`,
                    url: lib.downloads.classifiers[native].url,
                    hash: lib.downloads.classifiers[native].sha1,
                    download: true,
                    extract: ("extract" in lib) ? true : false,
                    exclude: ("extract" in lib) ? lib.extract.exclude[0] : false,
                    type: "native"
                  })
                }
              }
            } else {
              native = lib.natives[platform].replace("${arch}", arch);
              if (native in lib.downloads.classifiers) {
                fileList.push({
                  path: `${base}/${version}/natives/archive/${path.parse(lib.downloads.classifiers[native].path).base}`,
                  url: lib.downloads.classifiers[native].url,
                  hash: lib.downloads.classifiers[native].sha1,
                  download: true,
                  extract: ("extract" in lib) ? true : false,
                  exclude: ("extract" in lib) ? lib.extract.exclude[0] : false,
                  type: "native"
                })
              }
            }
          }
        }
      })

      // Handling of asset files.
      for (var k in assetInfo.objects) {
        let hash = assetInfo.objects[k].hash;
        fileList.push({
          path: `${base}/assets/${versionInfo.assets}/objects/${hash.substr(0, 2)}/${hash}`,
          copyTo: `${base}/assets/${versionInfo.assets}/virtual/legacy/${hash.substr(0, 2)}/${hash}`,
          url: `http://resources.download.minecraft.net/${hash.substr(0, 2)}/${hash}`,
          hash: hash,
          download: true,
          extract: false,
          exclude: false,
          type: "asset"
        })
      }
      // assetInfo.objects.forEach((file)=>{
      //   console.log(file);
      //   // fileList.push({
      //   //   path: `${base}/${versionInfo.assets}/${file.}`,
      //   //   url: file.
      //   // })
      // })

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

var minecraft = new Minecraft();

minecraft.checkFiles("1.12.2");
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
//
// module.exports = {
//   getManifest: getManifest,
//   getVersionInfo: getVersionInfo,
//   DownloadsHandler: DownloadsHandler
// }
