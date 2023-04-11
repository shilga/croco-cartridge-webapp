
class Communication {
    constructor() {
        this.buffer = [];
        this.send_active = false;
    }

    static getPorts() {
        return navigator.usb.getDevices().then(devices => {
            return devices;
        });
    }

    static requestPort() {
        const filters = [
            { 'vendorId': 0x239A }, // Adafruit boards
            { 'vendorId': 0xcafe }, // TinyUSB example
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
            })
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

    requestRomUploadCommand(banks, name) {
        return new Promise((resolve, reject) => {
            const enc = new TextEncoder("utf-8");
            var payload = new ArrayBuffer(19);
            var view = new DataView(payload);
            var arrayView = new Uint8Array(payload);
            view.setUint16(0, banks, false);
            arrayView.fill(0, 2, 19);
            arrayView.set(enc.encode(name), 2);

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
            this.executeCommand(4, arrayView, 17).then(result => {
                const enc = new TextDecoder("utf-8");
                var view = new DataView(result);
                var arrayView = new Uint8Array(result);
                var romInfo = {
                    name: enc.decode(arrayView)
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
}

export default Communication;