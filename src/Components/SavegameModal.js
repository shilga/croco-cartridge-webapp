import React from "react";
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import Form from 'react-bootstrap/Form';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import ProgressBar from 'react-bootstrap/ProgressBar';
import download from "downloadjs";

const BANK_SIZE = 0x2000;
const CHUNK_SIZE = 32;
const CHUNKS_PER_BANK = BANK_SIZE / CHUNK_SIZE;

class SavegameModal extends React.Component
{
    show = this.props.show;
    onHide = this.props.onHide;
    comm = this.props.comm;
    romInfo = this.props.romInfo;

    state = {
        uploadInProgress: false,
        downloadInProgress: false,
        bytesToTransfer: 0,
        bytesTransferred: 0,
    };

    onEnterHandler()
    {
        // this.setState({validRomLoaded: false});
    }

    async savegameDownloadButtonHandler () {
        var bytesToTransfer = this.props.romInfo.numRamBanks * BANK_SIZE;
        var bytesTransferred = 0;

        console.log("Starting download of " + this.props.romInfo.numRamBanks + "banks (" + bytesToTransfer + " Bytes)");

        await this.comm.requestSaveGameCommand(this.props.romInfo.romId);

        console.log("Download was accepted");

        var saveGameBuffer = new Uint8Array(bytesToTransfer);

        this.setState({bytesToTransfer: bytesToTransfer, bytesTransferred: 0, downloadInProgress: true});

        for (var bank = 0; bank < this.props.romInfo.numRamBanks; bank++) {
            for (var chunk = 0; chunk < CHUNKS_PER_BANK; chunk++) {
                var res = await this.comm.receiveSavegameChunkCommand();
                console.log(" Received bank " + res.bank + " chunk " + res.chunk);

                saveGameBuffer.set(res.data, bytesTransferred);

                bytesTransferred = (bank * BANK_SIZE) + ((chunk + 1) * CHUNK_SIZE);

                this.setState({bytesTransferred: bytesTransferred});
                if(res.bank !== bank || res.chunk !== chunk)
                {
                    console.log("Wrong bank/chunk");
                    return;
                }
            }
            this.setState({uploadedBank: bank});
        }

        console.log("Download was finished");

        download(saveGameBuffer, this.props.romInfo.name + ".sav", "octet-stream");

        this.setState({downloadInProgress: false});
    }

    render() {
        if(this.props.romInfo)
        {
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
                        </Form>

                        {this.state.downloadInProgress && <ProgressBar animated={false} now={this.state.bytesTransferred} max={this.state.bytesToTransfer} />}
                    </Modal.Body>
                    <Modal.Footer>
                        <Button onClick={() => this.savegameDownloadButtonHandler()} disabled={this.props.romInfo.numRamBanks === 0}>Download Savegame RAM</Button>
                        <Button onClick={this.onHide}>Close</Button>
                    </Modal.Footer>

                </Modal>
            );
        }
    }
};

export default SavegameModal;