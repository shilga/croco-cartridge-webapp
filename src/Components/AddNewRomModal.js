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

import React from "react";
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import Form from 'react-bootstrap/Form';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import ProgressBar from 'react-bootstrap/ProgressBar';

const BANK_SIZE = 0x4000;
const CHUNK_SIZE = 32;
const CHUNKS_PER_BANK = BANK_SIZE / CHUNK_SIZE;

class AddNewRomModal extends React.Component {
    show = this.props.show;
    onHide = this.props.onHide;
    onRomAdded = this.props.onRomAdded;
    onError = this.props.onError;
    comm = this.props.comm;
    availableBanks = this.props.availableBanks;

    state = {
        validRomLoaded: false,
        romInfo: { banks: 0, name: "", speedchangeBank: 0xFFFF },
        uploadInProgress: false,
        uploadRequestInProgress: false,
        uploadedBank: 0
    };

    rom;

    onEnterHandler() {
        this.setState({ validRomLoaded: false });
    }

    fileChangedHandler(e) {
        e.preventDefault();
        const fileObj = e.target.files && e.target.files[0];
        if (!fileObj) {
            console.log("no file selected");
            this.setState({ validRomLoaded: false });
            return;
        }
        const enc = new TextDecoder("utf-8");
        const reader = new FileReader();
        reader.onload = (e) => {
            this.rom = new Uint8Array(e.target.result);
            console.log("ROM is " + this.rom.byteLength + "bytes long");
            var banks = 1 << (this.rom[0x0148] + 1);
            var nameArray = this.rom.subarray(0x134, 0x134 + 16);
            var isCgbGame = this.rom[0x143] === 0xC0 || (this.rom[0x143] === 0x80);
            var zero = nameArray.findIndex((element, index, array) => { return element === 0; })
            if (zero === -1) {
                zero = isCgbGame ? 15 : 16;
            }

            var name = enc.decode(this.rom.subarray(0x134, 0x134 + zero));

            console.log("ROM has " + banks + " banks");
            console.log("ROM name is " + name);
            console.log("ROM is a CGB game: " + isCgbGame);
            console.log("Available banks: " + this.availableBanks);

            if (this.availableBanks >= banks) {
                var speedchangeBank = 0xffff;
                if (isCgbGame) {
                    var speedchangeState = 0;
                    for (var i = 0; (i < this.rom.byteLength) && (speedchangeBank === 0xffff); i++) {
                        var inst = this.rom[i];
                        if (speedchangeState === 0) {
                            if (inst === 0xe0) {
                                speedchangeState = 1;
                            }
                        }
                        else if (speedchangeState === 1) {
                            if (inst === 0x4d) {
                                speedchangeState = 2;
                            }
                            else {
                                speedchangeState = 0;
                            }
                        }
                        else if (speedchangeState === 2) {
                            if (inst === 0x10) {
                                speedchangeState = 4;
                                speedchangeBank = Math.floor(i / BANK_SIZE);
                                console.log("Speed change stop at " + i.toString(16));
                            }
                            else if (inst === 0xc9) // ret
                            {
                                speedchangeState = 0;
                            }
                            else if (inst === 0xFF) // rst or uninitialized
                            {
                                speedchangeState = 0;
                            }
                            else if (inst === 0xe0) { // ldh
                                speedchangeState = 3;
                            }
                            else if (inst === 0xf0) { // ldh
                                speedchangeState = 3;
                            }
                        }
                        else if (speedchangeState === 3) {
                            // just ignore this byte and go back to wait for stop state
                            speedchangeState = 2;
                        }
                        else {
                            console.log("That should not have happened");
                        }
                    }
                }

                console.log("Speed change happens in bank " + speedchangeBank);
                this.setState({
                    validRomLoaded: true,
                    romInfo: { banks: banks, name: name, speedchangeBank: speedchangeBank }
                });
            }
            else {
                console.log("Not enough banks available on cart!");
                this.setState({
                    validRomLoaded: false,
                    romInfo: { banks: banks, name: name }
                });

                this.onError("Not enough free banks available on cart for this ROM");
            }
        };
        reader.readAsArrayBuffer(fileObj);
    }

    async romUploadButtonHandler() {
        if (this.state.romInfo.name === "") {
            this.onError("ROM name must not be empty!");
            return;
        }

        console.log("Starting upload of " + this.state.romInfo.banks + " banks with speedSwitchBank=" + this.state.romInfo.speedchangeBank);

        this.setState({ uploadInProgress: true, uploadRequestInProgress: true, uploadedBank: this.state.romInfo.banks });
        try {
            await this.comm.requestRomUploadCommand(this.state.romInfo.banks, this.state.romInfo.name, this.state.romInfo.speedchangeBank);


            console.log("Upload was accepted");

            this.setState({ uploadRequestInProgress: false, uploadedBank: 0 });

            for (var bank = 0; bank < this.state.romInfo.banks; bank++) {
                for (var chunk = 0; chunk < CHUNKS_PER_BANK; chunk++) {
                    await this.comm.sendRomChunkCommand(bank, chunk, this.rom.subarray((bank * BANK_SIZE) + (chunk * CHUNK_SIZE), (bank * BANK_SIZE) + ((chunk + 1) * CHUNK_SIZE)));
                    console.log("Bank " + bank + " chunk " + chunk);
                }
                this.setState({ uploadedBank: bank });
            }

            console.log("Upload finished");
            this.setState({ uploadInProgress: false });

            this.onRomAdded();
        } catch (e) {
            this.onError("Uploading the ROM failed");
            this.setState({ uploadInProgress: false });
        }
    }

    render() {
        return (
            <Modal
                show={this.props.show}
                onHide={this.onHide}
                onEnter={() => this.onEnterHandler()}
                backdrop={this.state.uploadInProgress ? "static" : "dynamic"}
                size="lg"
                aria-labelledby="contained-modal-title-vcenter"
                centered
            >
                <Modal.Header closeButton>Add a new ROM</Modal.Header>
                <Modal.Body>
                    <Form>
                        <Form.Group as={Row}>
                            <Form.Label column sm="2">Select ROM</Form.Label>
                            <Col sm="10">
                                <Form.Control type="file" onChange={(e) => this.fileChangedHandler(e)} disabled={this.state.uploadInProgress} />
                            </Col>
                        </Form.Group>
                        <Form.Group as={Row}>
                            <Form.Label column sm="2">ROM Name:</Form.Label>
                            <Col sm="10">
                                <Form.Control type="text" maxLength={16} value={this.state.romInfo.name} onChange={(e) => this.setState({ romInfo: { name: e.target.value, banks: this.state.romInfo.banks, speedchangeBank: this.state.romInfo.speedchangeBank } })} />
                            </Col>
                        </Form.Group>
                        <Form.Group as={Row}>
                            <Form.Label column sm="2">ROM Banks:</Form.Label>
                            <Col sm="10">
                                <Form.Control plaintext readOnly value={this.state.romInfo.banks} />
                            </Col>
                        </Form.Group>
                    </Form>

                    {this.state.uploadInProgress && <ProgressBar animated={this.state.uploadRequestInProgress} now={this.state.uploadedBank} max={this.state.romInfo.banks} />}
                </Modal.Body>
                <Modal.Footer>
                    <Button onClick={this.onHide} disabled={this.state.uploadInProgress}>Close</Button>
                    <Button onClick={() => this.romUploadButtonHandler()} disabled={!this.state.validRomLoaded || this.state.uploadInProgress}>Upload</Button>
                </Modal.Footer>

            </Modal>
        );
    }
};

export default AddNewRomModal;