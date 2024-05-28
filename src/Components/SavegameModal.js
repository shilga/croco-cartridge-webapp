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

/* global BigInt */

import ConfirmationModal from './ConfirmationModal';
import React from "react";
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import Form from 'react-bootstrap/Form';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import ProgressBar from 'react-bootstrap/ProgressBar';
import download from "downloadjs";
const { addSeconds, fromUnixTime } = require("date-fns");

const BANK_SIZE = 0x2000;
const MBC2_RAM_SIZE = 0x200;
const CHUNK_SIZE = 32;
const RTC_SAVE_SIZE = 48;

class SavegameModal extends React.Component {
    show = this.props.show;
    onHide = this.props.onHide;
    onError = this.props.onError;
    comm = this.props.comm;
    romInfo = this.props.romInfo;

    state = {
        showConfirmationModal: false,
        confirmationMessage: null,
        confirmationId: 0,
        uploadInProgress: false,
        downloadInProgress: false,
        validSavegameLoaded: false,
        bytesToTransfer: 0,
        bytesTransferred: 0,
    };

    saveGameArray;
    saveGameSize = 0;
    saveGameHasRtc = false;

    onEnterHandler() {
        // this.setState({validRomLoaded: false});
    }

    async savegameUploadButtonHandler() {
        this.setState({ confirmationMessage: `Are you sure you want to upload the savegame? This will override the savegame currently on the cartridge.` });

        this.setState({ showConfirmationModal: true });
    }

    uploadRam = async (type, id) => {
        var bytesTransferred = 0;

        this.setState({ showConfirmationModal: false });

        console.log("Starting upload of " + this.props.romInfo.numRamBanks + "banks (" + this.saveGameSize + " Bytes)");

        try {
            await this.comm.requestSaveGameUploadCommand(this.props.romInfo.romId);

            console.log("Upload was accepted");

            this.setState({ bytesToTransfer: this.saveGameSize, bytesTransferred: 0, uploadInProgress: true });

            while (bytesTransferred < this.saveGameSize) {
                var bank = Math.floor(bytesTransferred / BANK_SIZE);
                var chunk = (bytesTransferred - (bank * BANK_SIZE)) / CHUNK_SIZE;

                await this.comm.sendSavegameChunkCommand(bank, chunk, this.saveGameArray.subarray((bank * BANK_SIZE) + (chunk * CHUNK_SIZE), (bank * BANK_SIZE) + ((chunk + 1) * CHUNK_SIZE)));
                console.log(" Send bank " + bank + " chunk " + chunk);

                bytesTransferred += CHUNK_SIZE;
                this.setState({ bytesTransferred: bytesTransferred });
            }

            console.log("Savegame Upload was finished");
        }
        catch (e) {
            this.onError("Uploading the savegame failed");
            this.setState({ uploadInProgress: false });

            console.log("Uploading the savegame failed: " + e);

            return;
        }

        if (this.saveGameHasRtc) {
            try {
                // convert timestamp to UTC
                var rtcData = this.saveGameArray.slice(this.saveGameSize, this.saveGameArray.byteLength);
                var view = new DataView(rtcData.buffer);
                var utcTimeStamp = Number(view.getBigUint64(40, true)); // JavaScript max Int is 2^53 - 1

                var localDate = fromUnixTime(utcTimeStamp);

                var localTimeStamp = utcTimeStamp - (localDate.getTimezoneOffset() * 60);
                view.setBigUint64(40, BigInt(localTimeStamp), true);

                console.log("Sending RTC data");
                this.comm.sendRtcDataCommand(this.props.romInfo.romId, rtcData);
            }
            catch (e) {
                this.onError("Uploading the RTC data failed");
                console.log("Uploading the RTC data failed: " + e);
            }
        }

        this.setState({ uploadInProgress: false });
    };

    async savegameDownloadButtonHandler() {
        var bytesToTransfer = this.props.romInfo.mbc !== 2 ? this.props.romInfo.numRamBanks * BANK_SIZE : MBC2_RAM_SIZE;
        var bytesTransferred = 0;
        var hasRtcData = false;
        var rtcData;

        console.log("Trying to get RTC...");
        try {
            rtcData = await this.comm.fetchRtcDataCommand(this.props.romInfo.romId);
            hasRtcData = true;
        }
        catch (e) {
            console.log("There was no RTC data");
        }

        console.log("Starting download of " + this.props.romInfo.numRamBanks + "banks (" + bytesToTransfer + " Bytes)");

        try {
            await this.comm.requestSaveGameDownloadCommand(this.props.romInfo.romId);

            console.log("Download was accepted");

            var saveGameBuffer = hasRtcData ? new Uint8Array(bytesToTransfer + 48) : new Uint8Array(bytesToTransfer);

            this.setState({ bytesToTransfer: bytesToTransfer, bytesTransferred: 0, downloadInProgress: true });

            while (bytesTransferred < bytesToTransfer) {
                var bank = Math.floor(bytesTransferred / BANK_SIZE);
                var chunk = (bytesTransferred - (bank * BANK_SIZE)) / CHUNK_SIZE;

                console.log("Expecting bank " + bank + " chunk " + chunk + " bytesTransferred " + bytesTransferred);

                var res = await this.comm.receiveSavegameChunkCommand();
                console.log("Received bank " + res.bank + " chunk " + res.chunk);

                saveGameBuffer.set(res.data, bytesTransferred);

                bytesTransferred += CHUNK_SIZE;

                this.setState({ bytesTransferred: bytesTransferred });
                if (res.bank !== bank || res.chunk !== chunk) {
                    console.log("Wrong bank/chunk");
                    return;
                }
            }

            console.log("Download was finished");

            if (hasRtcData) {
                // convert timestamp to UTC
                var view = new DataView(rtcData.buffer);
                var localTimeStamp = Number(view.getBigUint64(40, true)); // JavaScript max Int is 2^53 - 1

                var localDate = new Date(1970, 0, 1, 0, 0, 0, 0);
                localDate = addSeconds(localDate, localTimeStamp);

                var utcTimeStamp = localTimeStamp + (localDate.getTimezoneOffset() * 60);
                view.setBigUint64(40, BigInt(utcTimeStamp), true);

                saveGameBuffer.set(rtcData, bytesToTransfer);
                console.log("Concatinated rtcData");
            }

            download(saveGameBuffer, this.props.romInfo.name + ".sav", "octet-stream");

            this.setState({ downloadInProgress: false });
        }
        catch (e) {
            this.onError("Downloading the savegame failed");
            this.setState({ uploadInProgress: false });

            console.log("Downloading the savegame failed: " + e);
        }
    }

    fileChangedHandler(e) {
        e.preventDefault();
        const fileObj = e.target.files && e.target.files[0];
        if (!fileObj) {
            console.log("no file selected");
            this.setState({ validSavegameLoaded: false });
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            this.saveGameArray = new Uint8Array(e.target.result);
            console.log("Loaded savegame is " + this.saveGameArray.byteLength + "bytes long");

            this.saveGameHasRtc = false;
            this.saveGameSize = 0;

            if (this.saveGameArray.byteLength === this.props.romInfo.numRamBanks * BANK_SIZE) {
                this.setState({ validSavegameLoaded: true });
                this.saveGameSize = this.saveGameArray.byteLength;
            }
            else if (this.saveGameArray.byteLength === ((this.props.romInfo.numRamBanks * BANK_SIZE) + RTC_SAVE_SIZE)) {
                this.setState({ validSavegameLoaded: true });
                this.saveGameSize = this.saveGameArray.byteLength - RTC_SAVE_SIZE
                this.saveGameHasRtc = true;

                console.log("Detected RTC data");
            }
            else if ((this.props.romInfo.mbc === 2) && (this.saveGameArray.byteLength === MBC2_RAM_SIZE)) {
                this.setState({ validSavegameLoaded: true });
                this.saveGameSize = this.saveGameArray.byteLength;
            }
            else {
                this.setState({ validSavegameLoaded: false });
                console.log("Wrong savegame size, should be " + this.props.romInfo.numRamBanks * BANK_SIZE + "bytes long");
            }
        };
        reader.readAsArrayBuffer(fileObj);
    }

    render() {
        if (this.props.romInfo) {
            return (
                <Modal
                    show={this.props.show}
                    onHide={this.onHide}
                    onEnter={() => this.onEnterHandler()}
                    size="lg"
                    aria-labelledby="contained-modal-title-vcenter"
                    centered
                >

                    <Modal.Header closeButton>Manage Savegame for {this.props.romInfo.name}</Modal.Header>
                    <Modal.Body>
                        <Form>
                            <Form.Group as={Row}>
                                <Form.Label column sm="2">RAM Banks:</Form.Label>
                                <Col sm="10">
                                    <Form.Control plaintext readOnly value={this.props.romInfo.numRamBanks} />
                                </Col>
                            </Form.Group>

                            <Form.Group as={Row}>
                                <Form.Label column sm="2">Select Savegame</Form.Label>
                                <Col sm="10">
                                    <Form.Control type="file" onChange={(e) => this.fileChangedHandler(e)} disabled={this.state.uploadInProgress} />
                                </Col>
                            </Form.Group>
                        </Form>

                        {(this.state.downloadInProgress || this.state.uploadInProgress) && <ProgressBar animated={false} now={this.state.bytesTransferred} max={this.state.bytesToTransfer} />}
                    </Modal.Body>
                    <Modal.Footer>
                        <Button onClick={() => this.savegameUploadButtonHandler()} disabled={!this.state.validSavegameLoaded || this.state.downloadInProgress || this.state.uploadInProgress}>Upload Savegame RAM</Button>
                        <Button onClick={() => this.savegameDownloadButtonHandler()} disabled={this.state.downloadInProgress || this.state.uploadInProgress}>Download Savegame RAM</Button>
                        <Button onClick={this.onHide} disabled={this.state.downloadInProgress || this.state.uploadInProgress}>Close</Button>
                        <ConfirmationModal showModal={this.state.showConfirmationModal} confirmModal={this.uploadRam} hideModal={() => { this.setState({ showConfirmationModal: false }); }} title="Upload confirmation" id={this.state.confirmationId} message={this.state.confirmationMessage} />
                    </Modal.Footer>
                </Modal>
            );
        }
    }
};

export default SavegameModal;