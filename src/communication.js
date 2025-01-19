/* Croco Cartridge Webapp
 * Copyright (C) 2023 Sebastian Quilitz
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import StringView from "stringview"

class Communication {
    constructor() {
        this.buffer = [];
        this.send_active = false;
        this.featureStep = 0;
        this.supportsSpeedChangeBankInfo = false;
        this.supportsMbcInfo = false;
    }

    static getPorts() {
        return navigator.usb.getDevices().then(devices => {
            return devices;
        });
    }

    static requestPort() {
        const filters = [
            { 'vendorId': 0x2E8A, 'productId': 0x107F }, // TinyUSB example
            { 'vendorId': 0xcafe, 'productId': 0x2142 }, // TinyUSB example
        ];

        return navigator.usb.requestDevice({ 'filters': filters }).then(
            device => {
                return device;
            }
        );
    }

    getEndpoints(interfaces) {
        interfaces.forEach(element => {
            var alternates = element.alternates;
            alternates.forEach(elementalt => {
                if (elementalt.interfaceClass === 0xFF) {
                    console.log("Interface number:");
                    console.log(element.interfaceNumber);
                    this.ifNum = element.interfaceNumber;
                    elementalt.endpoints.forEach(elementendpoint => {
                        if (elementendpoint.direction === "out") {
                            console.log("Endpoint out: ");
                            console.log(elementendpoint.endpointNumber);
                            this.epOut = elementendpoint.endpointNumber;
                        }

                        if (elementendpoint.direction === "in") {
                            console.log("Endpoint in: ");
                            console.log(elementendpoint.endpointNumber);
                            this.epIn = elementendpoint.endpointNumber;
                        }
                    });
                }
            })
        })
    }

    getDevice() {
        let device = null;
        this.ready = false;
        return new Promise((resolve, reject) => {
            Communication.requestPort().then(dev => {
                console.log("Opening device...");
                device = dev;
                this.device = device;
                return dev.open();
            }).then(() => {
                console.log("Selecting configuration");
                return device.selectConfiguration(1);
            }).then(() => {
                console.log("Getting endpoints")
                this.getEndpoints(device.configuration.interfaces);
            }).then(() => {
                console.log("Claiming interface");
                return device.claimInterface(this.ifNum);
            }).then(() => {
                console.log("Select alt interface");
                return device.selectAlternateInterface(this.ifNum, 0);
            }).then(() => {
                console.log("Control Transfer Out");
                return device.controlTransferOut({
                    'requestType': 'class',
                    'recipient': 'interface',
                    'request': 0x22,
                    'value': 0x01,
                    'index': this.ifNum
                })
            }).then(() => {
                console.log("Ready!");
                this.ready = true;
                this.device = device;
                resolve();
            }).catch((error) => {
                reject(error);
            });
        });
    }


    executeCommand(command, payload, readBytes = 0) {
        return new Promise((resolve, reject) => {
            var buffer = new ArrayBuffer(1, { maxByteLength: 64 });
            var requestData = new Uint8Array(buffer);
            requestData[0] = command;
            if (payload instanceof Uint8Array) {
                buffer.resize(payload.byteLength + 1);
                requestData.set(payload, 1);
            }
            this.send(requestData);

            this.read(readBytes + 1).then(result => {
                var data = new DataView(result.data.buffer);
                console.log("executeCommand read " + data.getUint8(0) + " " + data.byteLength);
                if (data.getUint8(0) !== command) {
                    reject("Wrong answer");
                }

                resolve(result.data.buffer.slice(1));
            },
                error => {
                    reject(error);
                });
        });
    }


    read(num) {
        return new Promise((resolve, reject) => {
            this.device.transferIn(this.epIn, num).then(result => {
                resolve(result);
            },
                error => {
                    console.log("Error");
                    console.log(error);
                    reject(error);
                });
        });
    }

    send(data) {
        var buffer = new ArrayBuffer(data.byteLength);
        var view = new Uint8Array(buffer);
        view.set(data, 0);
        return this.device.transferOut(this.epOut, buffer);
    }

    readDeviceInfoCommand() {
        return new Promise((resolve, reject) => {
            this.executeCommand(254, null, 11).then(result => {
                var view = new DataView(result);
                var res = {
                    featureStep: view.getUint8(0),
                    hwVersion: view.getUint8(1),
                    swVersion: {
                        major: view.getUint8(2),
                        minor: view.getUint8(3),
                        patch: view.getUint8(4),
                        buildType: StringView.getString(view, 5, 1),
                        gitShort: view.getUint32(6),
                        gitDirty: view.getUint8(10) === 1 ? true : false
                    },
                };

                this.featureStep = res.featureStep;

                if (this.featureStep >= 2) {
                    this.supportsSpeedChangeBankInfo = true;
                }

                if (this.featureStep >= 3) {
                    this.supportsMbcInfo = true;
                }

                resolve(res);
            },
                error => {
                    console.log("readDeviceInfoCommand() " + error)
                    var res = {
                        featureStep: 0,
                        hwVersion: 1,
                        swVersion: {
                            major: 0,
                            minor: 0,
                            patch: 0,
                            buildType: "E",
                            gitShort: 0,
                            gitDirty: false
                        },
                    };
                    resolve(res);
                });
        });
    }

    readDeviceSerialId() {
        return new Promise((resolve, reject) => {
            this.executeCommand(253, null, 8).then(result => {
                var view = new Uint8Array(result);
                var res = Array.from(view, function(byte) {
                    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
                }).join('').toUpperCase();

                resolve(res);
            },
                error => {
                    reject(error);
                });
        });
    }

    readRomUtilizationCommand() {
        return new Promise((resolve, reject) => {
            this.executeCommand(1, null, 5).then(result => {
                var view = new DataView(result);
                var res = {
                    numRoms: view.getUint8(0),
                    usedBanks: view.getUint16(1),
                    maxBanks: view.getUint16(3)
                };
                resolve(res);
            },
                error => {
                    reject(error);
                });
        });
    }

    requestRomUploadCommand(banks, name, speedChangeBank) {
        return new Promise((resolve, reject) => {
            const enc = new TextEncoder("utf-8");
            var payload;
            if (this.supportsSpeedChangeBankInfo) {
                payload = new ArrayBuffer(21);
            }
            else {
                payload = new ArrayBuffer(19);
            }
            var view = new DataView(payload);
            var arrayView = new Uint8Array(payload);
            view.setUint16(0, banks, false);
            arrayView.fill(0, 2, 19);
            arrayView.set(enc.encode(name), 2);
            if (this.supportsSpeedChangeBankInfo) {
                view.setUint16(19, speedChangeBank);
            }

            this.executeCommand(2, arrayView, 1).then(result => {
                var data = new Uint8Array(result);
                if (data[0] !== 0) {
                    console.log("requestRomUploadCommand rejected with code " + data[0]);
                    reject("Rom not accepted");
                }

                resolve();
            },
                error => {
                    reject(error);
                });
        });
    }

    sendRomChunkCommand(bank, chunk, data) {
        return new Promise((resolve, reject) => {
            var payload = new ArrayBuffer(36);
            var view = new DataView(payload);
            var arrayView = new Uint8Array(payload);
            view.setUint16(0, bank, false);
            view.setUint16(2, chunk, false);
            arrayView.set(data, 4);
            this.executeCommand(3, arrayView, 1).then(result => {
                var data = new Uint8Array(result);
                if (data[0] !== 0) {
                    console.log("sendRomChunkCommand rejected with code " + data[0]);
                    reject("Rom chunk not accepted");
                }

                resolve();
            },
                error => {
                    reject(error);
                });
        });
    }

    readRomInfoCommand(rom) {
        return new Promise((resolve, reject) => {
            var payload = new ArrayBuffer(1);
            var view = new DataView(payload);
            var arrayView = new Uint8Array(payload);
            view.setUint8(0, rom);
            var receiveLength = 21;
            if (!this.supportsMbcInfo) {
                receiveLength = 20;
            }
            this.executeCommand(4, arrayView, receiveLength).then(result => {
                var view = new DataView(result);
                var romInfo = {
                    romId: rom,
                    name: StringView.getStringNT(view, 0),
                    numRamBanks: view.getUint8(17),
                    mbc: this.supportsMbcInfo ? view.getUint8(18) : 0xFF,
                    numRomBanks: view.byteLength > 19 ? view.getUint16(19) : 0
                };
                resolve(romInfo);
            },
                error => {
                    reject(error);
                });
        });
    }

    deleteRomCommand(romId) {
        return new Promise((resolve, reject) => {
            var payload = new ArrayBuffer(1);
            var view = new DataView(payload);
            var arrayView = new Uint8Array(payload);
            view.setUint8(0, romId);
            this.executeCommand(5, arrayView, 2).then(result => {
                var data = new Uint8Array(result);
                if (data[0] !== 0) {
                    console.log("deleteRomCommand rejected with code " + data[0]);
                    reject("Delete failed");
                }

                resolve();
            },
                error => {
                    reject(error);
                });
        });
    }

    requestSaveGameDownloadCommand(romId) {
        return new Promise((resolve, reject) => {
            var payload = new ArrayBuffer(1);
            var view = new DataView(payload);
            var arrayView = new Uint8Array(payload);
            view.setUint8(0, romId);
            this.executeCommand(6, arrayView, 2).then(result => {
                var data = new Uint8Array(result);
                if (data[0] !== 0) {
                    console.log("requestSaveGameCommand rejected with code " + data[0]);
                    reject("Request Savegame failed");
                }

                resolve();
            },
                error => {
                    reject(error);
                });
        });
    }

    receiveSavegameChunkCommand() {
        return new Promise((resolve, reject) => {
            this.executeCommand(7, null, 36).then(result => {
                var view = new DataView(result);
                var data = new Uint8Array(result);
                var res = {
                    bank: view.getUint16(0),
                    chunk: view.getUint16(2),
                    data: data.subarray(4, 36)
                };

                resolve(res);
            },
                error => {
                    reject(error);
                });
        });
    }

    requestSaveGameUploadCommand(romId) {
        return new Promise((resolve, reject) => {
            var payload = new ArrayBuffer(1);
            var view = new DataView(payload);
            var arrayView = new Uint8Array(payload);
            view.setUint8(0, romId);

            this.executeCommand(8, arrayView, 1).then(result => {
                var data = new Uint8Array(result);
                if (data[0] !== 0) {
                    console.log("requestSaveGameUploadCommand rejected with code " + data[0]);
                    reject("Savegame not accepted");
                }

                resolve();
            },
                error => {
                    reject(error);
                });
        });
    }

    sendSavegameChunkCommand(bank, chunk, data) {
        return new Promise((resolve, reject) => {
            var payload = new ArrayBuffer(36);
            var view = new DataView(payload);
            var arrayView = new Uint8Array(payload);
            view.setUint16(0, bank, false);
            view.setUint16(2, chunk, false);
            arrayView.set(data, 4);
            this.executeCommand(9, arrayView, 1).then(result => {
                var data = new Uint8Array(result);
                if (data[0] !== 0) {
                    console.log("sendSavegameChunkCommand rejected with code " + data[0]);
                    reject("RAM chunk not accepted");
                }

                resolve();
            },
                error => {
                    reject(error);
                });
        });
    }

    fetchRtcDataCommand(romId) {
        return new Promise((resolve, reject) => {
            var payload = new ArrayBuffer(1);
            var view = new DataView(payload);
            var arrayView = new Uint8Array(payload);
            view.setUint8(0, romId);

            this.executeCommand(10, arrayView, 49).then(result => {
                var data = new Uint8Array(result);
                if (data[0] !== romId) {
                    console.log("fetchRtcDataCommand rejected with code " + data[0]);
                    reject("RTC data could not be fetched");
                }

                resolve(data.slice(1));
            },
                error => {
                    reject(error);
                });
        });
    }

    sendRtcDataCommand(romId, data) {
        return new Promise((resolve, reject) => {
            var payload = new ArrayBuffer(49);
            var view = new DataView(payload);
            var arrayView = new Uint8Array(payload);
            view.setUint8(0, romId);
            arrayView.set(data, 1);

            this.executeCommand(11, arrayView, 1).then(result => {
                var data = new Uint8Array(result);
                if (data[0] !== romId) {
                    console.log("sendRtcDataCommand rejected with code " + data[0]);
                    reject("RTC data could not be send");
                }

                resolve(data.subarray(1, 49));
            },
                error => {
                    reject(error);
                });
        });
    }

}

export default Communication;